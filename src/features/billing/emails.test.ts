import { describe, expect, it } from "vitest";

import { billingEmail } from "@/features/billing/emails";

describe("billing emails", () => {
  it("receipts link the invoice and escape the business name", () => {
    const mail = billingEmail("a@b.co", "Mega <Retail>", {
      type: "receipt",
      invoiceNumber: "SV2627-00001",
      amount: 3538.82,
      planName: "Growth",
      invoiceUrl: "https://app.example/i/1",
    });
    expect(mail.subject).toBe("Shopverse invoice SV2627-00001 · ₹3,538.82 paid");
    expect(mail.html).toContain("Mega &lt;Retail&gt;");
    expect(mail.html).toContain("https://app.example/i/1");
  });

  it("failed payments say selling continues and give the deadline", () => {
    const mail = billingEmail("a@b.co", "Mega", {
      type: "payment_failed",
      planName: "Growth",
      updateUrl: "https://rzp.io/x",
      graceEndsAt: "2026-11-04T06:00:00Z",
    });
    expect(mail.text).toContain("Your shops keep selling");
    expect(mail.text).toContain("4 November");
    expect(mail.html).toContain("https://rzp.io/x");
  });
});
