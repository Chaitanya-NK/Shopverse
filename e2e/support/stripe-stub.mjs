/* eslint-disable no-console -- test server */
// A small stand-in for Stripe, for the end-to-end tests: the REST calls the
// app makes for shop payments and plan subscriptions, and a fake Stripe.js
// with the same browser API (Stripe(pk).initCheckout → createPaymentElement,
// confirm). Playwright starts it (see playwright.config.ts) and points the app
// at it with STRIPE_API_URL and STRIPE_JS_URL.
//
// It is not Stripe: no real cards, no webhooks. The app confirms payments on
// the return page by reading the session back, which this stub answers.
import { randomBytes } from "node:crypto";
import { createServer } from "node:http";

const PORT = Number(process.env.STRIPE_STUB_PORT ?? 12111);
const BASE = `http://127.0.0.1:${PORT}`;
const now = () => Math.floor(Date.now() / 1000);
const rid = (prefix) => `${prefix}_test_${randomBytes(10).toString("hex")}`;

const sessions = new Map();
const prices = new Map();
const subscriptions = new Map();

/** a[b][0][c]=v → nested objects and arrays (Stripe's form encoding). */
function parseForm(body) {
  const out = {};
  for (const pair of body.split("&").filter(Boolean)) {
    const [k, v = ""] = pair.split("=").map((x) => decodeURIComponent(x.replace(/\+/g, " ")));
    const keys = k.replace(/\]/g, "").split("[");
    let o = out;
    keys.forEach((key, i) => {
      if (i === keys.length - 1) o[key] = v;
      else o = o[key] ??= /^\d+$/.test(keys[i + 1]) ? [] : {};
    });
  }
  return out;
}

const read = (req) =>
  new Promise((resolve) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => resolve(body));
  });
const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "*" };
const json = (res, status, body) => {
  res.writeHead(status, { "content-type": "application/json", ...cors });
  res.end(JSON.stringify(body));
};
const fail = (res, status, message) =>
  json(res, status, { error: { type: "invalid_request_error", message } });

/** The account behind a secret key: any well-formed test key works. */
const accountOf = (req) => {
  const key = (req.headers.authorization ?? "").replace(/^Bearer /, "");
  return /^sk_test_[A-Za-z0-9]{10,}$/.test(key) ? `acct_${key.slice(8, 24)}` : null;
};

function view(session, expand = []) {
  const out = { ...session };
  if (expand.some((e) => e.startsWith("subscription")) && session.subscription)
    out.subscription = subscriptions.get(session.subscription);
  return out;
}

/** The customer paid (from the fake Stripe.js): complete the session. */
function complete(session) {
  session.status = "complete";
  session.payment_status = "paid";
  if (session.mode === "payment") {
    session.payment_intent = {
      id: rid("pi"),
      object: "payment_intent",
      amount: session.amount_total,
      amount_received: session.amount_total,
      currency: session.currency,
      status: "succeeded",
      latest_charge: { id: rid("ch"), payment_method_details: { type: "card" } },
    };
  } else {
    const price = prices.get(session.line_items[0].price);
    const start = now();
    const end = start + (price.recurring.interval === "year" ? 365 : 30) * 86400;
    const id = rid("sub");
    subscriptions.set(id, {
      id,
      object: "subscription",
      status: "active",
      customer: rid("cus"),
      cancel_at_period_end: false,
      schedule: null,
      metadata: session.subscription_data?.metadata ?? {},
      items: {
        data: [
          {
            id: rid("si"),
            price: { id: price.id },
            current_period_start: start,
            current_period_end: end,
          },
        ],
      },
      latest_invoice: {
        id: rid("in"),
        object: "invoice",
        status: "paid",
        amount_paid: price.unit_amount,
        amount_due: price.unit_amount,
        hosted_invoice_url: null,
        billing_reason: "subscription_create",
        parent: { subscription_details: { subscription: id } },
      },
    });
    session.subscription = id;
  }
}

const STRIPE_JS = `
// Fake Stripe.js (e2e stub): the same calls the app uses, without Stripe.
(function () {
  window.Stripe = function (publishableKey) {
    return {
      initCheckout: async function (options) {
        var clientSecret = await options.fetchClientSecret();
        window.__stripeStub = { publishableKey: publishableKey, elementsOptions: options.elementsOptions };
        return {
          createPaymentElement: function () {
            return {
              mount: function (el) {
                el.innerHTML =
                  '<div data-stripe-stub style="display:grid;gap:8px">' +
                  '<label>Card number <input name="card" value="4242 4242 4242 4242" autocomplete="off"></label>' +
                  '<label><input type="checkbox" name="decline"> Decline this payment (test)</label></div>';
              },
              destroy: function () {},
            };
          },
          confirm: async function () {
            var decline = document.querySelector('[data-stripe-stub] [name="decline"]');
            if (decline && decline.checked)
              return { type: "error", error: { message: "Your card was declined." } };
            var res = await fetch("${BASE}/js/confirm", {
              method: "POST",
              headers: { "content-type": "text/plain" },
              body: JSON.stringify({ clientSecret: clientSecret, publishableKey: publishableKey }),
            });
            var body = await res.json();
            if (body.error) return { type: "error", error: { message: body.error } };
            window.location.assign(body.redirect);
            return { type: "success" };
          },
        };
      },
    };
  };
})();
`;

createServer(async (req, res) => {
  const url = new URL(req.url, BASE);
  const path = url.pathname;
  let m;
  try {
    if (req.method === "OPTIONS") {
      res.writeHead(204, cors);
      return res.end();
    }
    if (path === "/health") return json(res, 200, { ok: true });
    if (path === "/js/basil/stripe.js") {
      res.writeHead(200, { "content-type": "text/javascript", ...cors });
      return res.end(STRIPE_JS);
    }
    if (path === "/js/confirm" && req.method === "POST") {
      const { clientSecret, publishableKey } = JSON.parse(await read(req));
      const session = [...sessions.values()].find((s) => s.client_secret === clientSecret);
      if (!session) return json(res, 404, { error: "No such session" });
      if (!/^pk_test_/.test(publishableKey ?? "")) return json(res, 400, { error: "Bad key" });
      if (session.status !== "open") return json(res, 400, { error: "This session is not open" });
      complete(session);
      return json(res, 200, {
        redirect: session.return_url.replace("{CHECKOUT_SESSION_ID}", session.id),
      });
    }
    if ((m = path.match(/^\/pay\/(cs_[A-Za-z0-9_]+)$/))) {
      // Stripe's hosted page, for accounts without a publishable key.
      const session = sessions.get(m[1]);
      if (!session) return fail(res, 404, "No such session");
      if (req.method === "POST") {
        complete(session);
        res.writeHead(303, {
          location: session.success_url.replace("{CHECKOUT_SESSION_ID}", session.id),
        });
        return res.end();
      }
      res.writeHead(200, { "content-type": "text/html" });
      return res.end(
        `<h1>Stripe test checkout</h1><form method="post"><button>Pay</button></form>`,
      );
    }

    // REST API (/v1/…), authenticated with a secret key.
    if (!path.startsWith("/v1/")) return fail(res, 404, `Unknown path ${path}`);
    const account = accountOf(req);
    if (!account) return fail(res, 401, "Invalid API Key provided");
    const raw = req.method === "POST" ? await read(req) : url.search.slice(1);
    const body = parseForm(raw);
    const expand = Object.values(body.expand ?? {});

    if (path === "/v1/account") return json(res, 200, { id: account, object: "account" });

    if (path === "/v1/prices" && req.method === "POST") {
      const price = {
        id: rid("price"),
        object: "price",
        unit_amount: Number(body.unit_amount),
        currency: body.currency,
        recurring: { interval: body.recurring?.interval ?? "month" },
      };
      prices.set(price.id, price);
      return json(res, 200, price);
    }

    if (path === "/v1/checkout/sessions" && req.method === "POST") {
      const items = body.line_items ?? [];
      const custom = body.ui_mode === "custom";
      if (custom && (!body.return_url || body.success_url))
        return fail(res, 400, "ui_mode=custom needs return_url and no success_url");
      if (!custom && !body.success_url) return fail(res, 400, "success_url is required");
      if (body.mode === "subscription" && !prices.has(items[0]?.price))
        return fail(res, 400, "No such price");
      const amount =
        body.mode === "subscription"
          ? prices.get(items[0].price).unit_amount
          : items.reduce(
              (n, li) => n + Number(li.price_data?.unit_amount ?? 0) * Number(li.quantity ?? 1),
              0,
            );
      const id = rid("cs");
      const session = {
        id,
        object: "checkout.session",
        account,
        mode: body.mode,
        ui_mode: custom ? "custom" : "hosted",
        status: "open",
        payment_status: "unpaid",
        amount_total: amount,
        currency: items[0]?.price_data?.currency ?? "inr",
        client_reference_id: body.client_reference_id ?? null,
        metadata: body.metadata ?? {},
        customer: null,
        customer_email: body.customer_email ?? null,
        payment_intent: null,
        subscription: null,
        subscription_data: body.subscription_data,
        line_items: items,
        return_url: body.return_url ?? null,
        success_url: body.success_url ?? null,
        client_secret: custom ? `${id}_secret_${randomBytes(8).toString("hex")}` : null,
        url: custom ? null : `${BASE}/pay/${id}`,
      };
      sessions.set(id, session);
      return json(res, 200, view(session));
    }
    if ((m = path.match(/^\/v1\/checkout\/sessions\/([^/]+)$/)) && req.method === "GET") {
      const session = sessions.get(m[1]);
      if (!session || session.account !== account)
        return fail(res, 404, "No such checkout.session");
      return json(res, 200, view(session, expand));
    }
    if ((m = path.match(/^\/v1\/subscriptions\/([^/]+)$/)) && req.method === "GET") {
      const sub = subscriptions.get(m[1]);
      return sub ? json(res, 200, sub) : fail(res, 404, "No such subscription");
    }
    return fail(res, 404, `The stub doesn't know ${req.method} ${path}`);
  } catch (error) {
    console.error(error);
    return fail(res, 500, String(error));
  }
}).listen(PORT, "127.0.0.1", () => console.log(`Stripe stub on ${BASE}`));
