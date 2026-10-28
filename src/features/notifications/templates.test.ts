import { describe, expect, it } from "vitest";

import { type OrderEmailContext, orderEventEmail } from "@/features/notifications/templates";

const ctx: OrderEmailContext = {
  to: "meera@example.com",
  customerName: "Meera Iyer",
  shopName: "Urban <Threads>",
  supportEmail: "help@urbanthreads.in",
  supportPhone: null,
  orderNumber: "UT-000001",
  orderUrl: "https://shop.example/s/urban-threads/orders/abc",
  invoiceUrl: null,
  total: 548,
  shipping: 49,
  discount: null,
  currency: "INR",
  cashOnDelivery: true,
  items: [{ title: "Tee <M>", quantity: 1, total: 499 }],
};

describe("orderEventEmail", () => {
  it("escapes shop and item names in HTML", () => {
    const mail = orderEventEmail(ctx, { type: "confirmed" });
    expect(mail.html).toContain("Urban &lt;Threads&gt;");
    expect(mail.html).toContain("Tee &lt;M&gt;");
    expect(mail.html).not.toContain("<Threads>");
    expect(mail.replyTo).toBe("help@urbanthreads.in");
  });

  it("puts the delivery code in the subject and body, with the amount to keep ready", () => {
    const mail = orderEventEmail(ctx, {
      type: "out_for_delivery",
      shipmentNumber: "UT-000001-1",
      trackingUrl: "https://shop.example/track/t",
      otp: "482913",
    });
    expect(mail.subject).toMatch(/^482913 is your delivery code/);
    expect(mail.text).toContain("482913");
    expect(mail.text).toContain("₹548");
  });

  it("words cancellations by who cancelled", () => {
    expect(orderEventEmail(ctx, { type: "cancelled", byCustomer: true }).text).toMatch(
      /As you asked/,
    );
    expect(orderEventEmail(ctx, { type: "cancelled", byCustomer: false }).text).toMatch(
      /cancelled by/,
    );
  });

  it("shows the discount and its code", () => {
    const mail = orderEventEmail(
      { ...ctx, discount: { amount: 50, code: "WELCOME<10>" } },
      { type: "confirmed" },
    );
    expect(mail.html).toContain("Discount (WELCOME&lt;10&gt;)");
    expect(mail.html).toContain("−₹50");
  });

  it("links the invoice once there is one", () => {
    const mail = orderEventEmail(
      { ...ctx, invoiceUrl: "https://shop.example/inv" },
      { type: "delivered", shipmentNumber: "UT-000001-1" },
    );
    expect(mail.html).toContain("https://shop.example/inv");
  });
});
