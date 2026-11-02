import { describe, expect, it } from "vitest";

import { confirmCheckout, googleFontFor, initCheckout, luminance } from "./stripe-browser";

describe("Stripe field styling", () => {
  it("serves the page's font to Stripe's frame from Google Fonts", () => {
    expect(
      googleFontFor("'DM Sans Variable', 'Noto Sans Devanagari Variable', sans-serif"),
    ).toEqual({
      family: "DM Sans",
      cssSrc: "https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600&display=swap",
    });
    expect(googleFontFor('"Playfair Display Variable", serif')?.family).toBe("Playfair Display");
    // next/font names Geist "__Geist_abc123"; Geist Mono stays mono.
    expect(googleFontFor("__Geist_abc123, __Geist_Fallback_abc123")?.family).toBe("Geist");
    expect(googleFontFor("'Geist Mono', monospace")?.family).toBe("Geist Mono");
  });

  it("leaves fonts it doesn't know to the browser", () => {
    expect(googleFontFor("ui-sans-serif, system-ui")).toBeNull();
    expect(googleFontFor("")).toBeNull();
  });

  it("tells light from dark backgrounds", () => {
    expect(luminance([255, 255, 255])).toBeCloseTo(1);
    expect(luminance([0, 0, 0])).toBe(0);
    expect(luminance([10, 10, 10])).toBeLessThan(0.2);
    expect(luminance([250, 250, 250])).toBeGreaterThan(0.2);
  });
});

describe("initCheckout across Stripe.js versions", () => {
  const options = { appearance: {}, fonts: [] };
  const checkout = { createPaymentElement: () => ({ mount() {} }) };
  /** A Stripe.js init function that accepts only one of the two option names. */
  const initAccepting =
    (name: "clientSecret" | "fetchClientSecret", seen: unknown[]) =>
    async (opts: Record<string, unknown>) => {
      seen.push(opts);
      const other = name === "clientSecret" ? "fetchClientSecret" : "clientSecret";
      if (other in opts)
        throw new Error(
          `Invalid initCheckout() parameter: options.${other} is not an accepted parameter.`,
        );
      if (name === "fetchClientSecret")
        expect(await (opts.fetchClientSecret as () => Promise<string>)()).toBe("cs_1_secret");
      else expect(opts.clientSecret).toBe("cs_1_secret");
      return checkout;
    };

  it("basil: initCheckout with fetchClientSecret, even when the newer name exists", async () => {
    const seen: unknown[] = [];
    const init = initAccepting("fetchClientSecret", seen);
    await expect(
      initCheckout({ initCheckout: init, initCheckoutElementsSdk: init }, "cs_1_secret", options),
    ).resolves.toBe(checkout);
    expect(seen).toHaveLength(1);
  });

  it("clover and later: initCheckoutElementsSdk with clientSecret", async () => {
    const seen: unknown[] = [];
    const init = initAccepting("clientSecret", seen);
    await expect(
      initCheckout({ initCheckoutElementsSdk: init as never }, "cs_1_secret", options),
    ).resolves.toBe(checkout);
    expect(seen).toHaveLength(1);
  });

  it("tries the other option name when Stripe.js rejects the first", async () => {
    const seen: unknown[] = [];
    await expect(
      initCheckout(
        { initCheckoutElementsSdk: initAccepting("fetchClientSecret", seen) as never },
        "cs_1_secret",
        options,
      ),
    ).resolves.toBe(checkout);
    expect(seen).toHaveLength(2);
  });

  it("passes other errors on", async () => {
    const init = async () => {
      throw new Error("No such checkout session");
    };
    await expect(initCheckout({ initCheckout: init }, "cs_1_secret", options)).rejects.toThrow(
      "No such checkout session",
    );
  });
});

describe("confirmCheckout", () => {
  const payer = { name: "Asha Rao", address: { city: "Pune", country: "IN" } };

  it("sends the payer's name and address with the payment", async () => {
    const calls: unknown[] = [];
    const checkout = {
      createPaymentElement: () => ({ mount() {} }),
      confirm: async (options?: unknown) => {
        calls.push(options);
        return { type: "success" as const };
      },
    };
    await expect(confirmCheckout(checkout, payer)).resolves.toEqual({ type: "success" });
    expect(calls).toEqual([{ billingAddress: payer }]);
  });

  it("confirms without it when Stripe.js doesn't take the option", async () => {
    const calls: unknown[] = [];
    const checkout = {
      createPaymentElement: () => ({ mount() {} }),
      confirm: async (options?: unknown) => {
        calls.push(options);
        if (options) throw new Error("options.billingAddress is not an accepted parameter.");
        return { type: "success" as const };
      },
    };
    await expect(confirmCheckout(checkout, payer)).resolves.toEqual({ type: "success" });
    expect(calls).toEqual([{ billingAddress: payer }, undefined]);
  });
});
