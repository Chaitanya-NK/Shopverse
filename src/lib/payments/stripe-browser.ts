/**
 * Stripe.js in the browser, for Stripe's payment fields on Shopverse's own
 * pages (Elements with the Checkout Sessions API, `ui_mode: "custom"`).
 *
 * Stripe.js always comes from js.stripe.com (never bundled), in the version
 * that matches the API version the server pins (basil): there,
 * `stripe.initCheckout({ fetchClientSecret })` resolves to a checkout whose
 * `confirm()` sends the customer on to the session's return_url. Later
 * versions (initCheckoutElementsSdk, loadActions) are handled too, so a newer
 * script keeps working.
 */

import type { BillingAddress } from "@/lib/payments/start";

export type StripeAppearance = {
  theme?: "stripe" | "night" | "flat";
  variables?: Record<string, string>;
  rules?: Record<string, Record<string, string>>;
};
export type StripeFont = { cssSrc: string };

type ConfirmResult = { type: "success" } | { type: "error"; error: { message?: string } };
type ConfirmOptions = { billingAddress?: BillingAddress };
type PaymentElement = {
  mount(target: HTMLElement): void;
  destroy?(): void;
  on?(event: string, handler: (event: { complete?: boolean }) => void): void;
};
export type StripeCheckout = {
  createPaymentElement(options?: Record<string, unknown>): PaymentElement;
  confirm?(options?: ConfirmOptions): Promise<ConfirmResult>;
  loadActions?(): Promise<
    | { type: "success"; actions: { confirm(options?: ConfirmOptions): Promise<ConfirmResult> } }
    | { type: "error"; error: { message?: string } }
  >;
};
type ElementsOptions = { appearance: StripeAppearance; fonts: StripeFont[] };
type StripeInstance = {
  initCheckout?(options: Record<string, unknown>): StripeCheckout | Promise<StripeCheckout>;
  initCheckoutElementsSdk?(
    options: Record<string, unknown>,
  ): StripeCheckout | Promise<StripeCheckout>;
};
type StripeFactory = (publishableKey: string, options?: Record<string, unknown>) => StripeInstance;

declare global {
  interface Window {
    Stripe?: StripeFactory;
  }
}

const loading = new Map<string, Promise<StripeFactory>>();

/** Load Stripe.js once per page (from `url`, normally js.stripe.com). */
export function loadStripeJs(url: string): Promise<StripeFactory> {
  if (window.Stripe) return Promise.resolve(window.Stripe);
  let promise = loading.get(url);
  if (!promise) {
    promise = new Promise<StripeFactory>((resolve, reject) => {
      const script = document.createElement("script");
      script.src = url;
      script.async = true;
      script.onload = () =>
        window.Stripe ? resolve(window.Stripe) : reject(new Error("Stripe.js didn't load"));
      script.onerror = () => {
        loading.delete(url);
        script.remove();
        reject(new Error("Stripe.js didn't load"));
      };
      document.head.appendChild(script);
    });
    loading.set(url, promise);
  }
  return promise;
}

/**
 * Start Stripe's checkout for a session's client secret. Stripe.js versions
 * differ in the option's name: basil (the one we load) takes
 * `fetchClientSecret`, even under its newer alias `initCheckoutElementsSdk`;
 * clover and later take `clientSecret`. Use the classic `initCheckout` with
 * `fetchClientSecret` when it exists, and if Stripe.js says that option isn't
 * accepted, try the other.
 */
export async function initCheckout(
  stripe: StripeInstance,
  clientSecret: string,
  elementsOptions: ElementsOptions,
): Promise<StripeCheckout> {
  const init = stripe.initCheckout ?? stripe.initCheckoutElementsSdk;
  if (!init) throw new Error("This version of Stripe.js can't take payments here");
  const call = (options: Record<string, unknown>) =>
    Promise.resolve(init.call(stripe, { ...options, elementsOptions }));
  const preferFetch = Boolean(stripe.initCheckout);
  const first = preferFetch ? { fetchClientSecret: async () => clientSecret } : { clientSecret };
  const second = preferFetch ? { clientSecret } : { fetchClientSecret: async () => clientSecret };
  try {
    return await call(first);
  } catch (error) {
    if (!/is not an accepted parameter/i.test(String((error as Error)?.message ?? error)))
      throw error;
    return call(second);
  }
}

/**
 * Confirm the payment; on success the browser goes to the return URL. The
 * payer's name and address go with it (Stripe India needs them, e.g. for
 * cards issued abroad). If a Stripe.js version doesn't take the option, it's
 * confirmed without.
 */
export async function confirmCheckout(
  checkout: StripeCheckout,
  billingAddress: BillingAddress | null = null,
): Promise<ConfirmResult> {
  let confirm: (options?: ConfirmOptions) => Promise<ConfirmResult>;
  if (checkout.confirm) confirm = checkout.confirm.bind(checkout);
  else {
    const loaded = await checkout.loadActions!();
    if (loaded.type === "error") return loaded;
    confirm = loaded.actions.confirm.bind(loaded.actions);
  }
  if (!billingAddress) return confirm();
  try {
    return await confirm({ billingAddress });
  } catch (error) {
    if (!/not an accepted parameter/i.test(String((error as Error)?.message ?? error))) throw error;
    return confirm();
  }
}

// ---------------------------------------------------------------------------
// Appearance: Stripe's fields styled like the page around them
// ---------------------------------------------------------------------------

/** The page's fonts, as Google Fonts can serve them inside Stripe's frame. */
const GOOGLE_FONTS: [RegExp, string][] = [
  [/geist mono/i, "Geist Mono"],
  [/geist/i, "Geist"],
  [/dm sans/i, "DM Sans"],
  [/space grotesk/i, "Space Grotesk"],
  [/nunito/i, "Nunito"],
  [/fraunces/i, "Fraunces"],
  [/playfair/i, "Playfair Display"],
  [/lora/i, "Lora"],
];

/** The Google Fonts family for a CSS font-family list (its first font), if any. */
export function googleFontFor(fontFamily: string): { family: string; cssSrc: string } | null {
  const first =
    fontFamily
      .split(",")[0]
      ?.trim()
      .replace(/^["']|["']$/g, "") ?? "";
  const match = GOOGLE_FONTS.find(([re]) => re.test(first));
  if (!match) return null;
  const family = match[1];
  return {
    family,
    cssSrc: `https://fonts.googleapis.com/css2?family=${family.replace(/ /g, "+")}:wght@400;500;600&display=swap`,
  };
}

/** Relative luminance of an [r, g, b] colour (0 = black, 1 = white). */
export function luminance([r, g, b]: [number, number, number]): number {
  const lin = (c: number) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

const hex = (rgb: [number, number, number]) =>
  `#${rgb.map((c) => c.toString(16).padStart(2, "0")).join("")}`;

/**
 * Any CSS colour (oklch() included) as [r, g, b], by painting it: Stripe's
 * appearance API wants plain hex or rgb colours.
 */
function toRgb(color: string, ctx: CanvasRenderingContext2D): [number, number, number] | null {
  if (!color) return null;
  ctx.clearRect(0, 0, 1, 1);
  ctx.fillStyle = "#000";
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, 1, 1);
  const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
  return [r!, g!, b!];
}

/**
 * Stripe's appearance settings read from the page's own design tokens
 * (--primary, --card, --border, --radius…) at `el`, so the payment fields
 * match the shop's colours, corners and font, in light and dark mode.
 */
export function appearanceFrom(el: HTMLElement): ElementsOptions {
  const style = getComputedStyle(el);
  const token = (name: string) => style.getPropertyValue(name).trim();
  const ctx = document.createElement("canvas").getContext("2d", { willReadFrequently: true });

  const color = (name: string, fallback: string) => {
    const rgb = ctx ? toRgb(token(name) || fallback, ctx) : null;
    return rgb ? hex(rgb) : fallback;
  };
  const background = color("--card", "#ffffff");
  const text = color("--card-foreground", "#0a0a0a");
  const primary = color("--primary", "#171717");
  const border = color("--input", "#e5e5e5");
  const ring = color("--ring", primary);
  const dark = ctx ? luminance(toRgb(background, ctx) ?? [255, 255, 255]) < 0.2 : false;

  // --radius as pixels, via a probe element.
  const probe = document.createElement("div");
  probe.style.borderRadius = "var(--radius, 0.5rem)";
  el.appendChild(probe);
  const radius = getComputedStyle(probe).borderTopLeftRadius || "8px";
  probe.remove();

  const font = googleFontFor(style.fontFamily);
  const fontFamily = font
    ? `'${font.family}', system-ui, sans-serif`
    : style.fontFamily || "system-ui, sans-serif";

  return {
    fonts: font ? [{ cssSrc: font.cssSrc }] : [],
    appearance: {
      theme: dark ? "night" : "stripe",
      variables: {
        colorPrimary: primary,
        colorBackground: background,
        colorText: text,
        colorTextSecondary: color("--muted-foreground", "#737373"),
        colorTextPlaceholder: color("--muted-foreground", "#737373"),
        colorDanger: color("--destructive", "#dc2626"),
        fontFamily,
        fontSizeBase: "15px",
        borderRadius: radius,
        spacingUnit: "4px",
      },
      rules: {
        ".Input": { border: `1px solid ${border}`, boxShadow: "none" },
        ".Input:focus": { borderColor: ring, boxShadow: `0 0 0 3px ${ring}40` },
        ".Tab": { border: `1px solid ${border}`, boxShadow: "none" },
        ".Tab--selected": { borderColor: primary, boxShadow: `0 0 0 1px ${primary}` },
        ".Label": { fontWeight: "500" },
      },
    },
  };
}
