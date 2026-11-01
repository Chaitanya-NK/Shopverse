import { describe, expect, it } from "vitest";

import { cartReminderEmail } from "@/features/marketing/emails";

const base = {
  to: "bob@example.com",
  name: "Bob Kumar",
  shopName: "Urban <Threads>",
  color: "#2563eb",
  items: [{ title: "Tee · L", quantity: 2, price: 499, imageUrl: null }],
  subtotal: 998,
  discountCode: "COMEBACK10",
  restoreUrl: "https://x/restore",
  stopUrl: "https://x/stop",
  supportEmail: null,
};

describe("cart reminder email", () => {
  it("greets, lists the cart and offers the code", () => {
    const mail = cartReminderEmail(base);
    expect(mail.subject).toBe("Bob, you left something in your Urban <Threads> cart");
    expect(mail.text).toContain("- 2 × Tee · L (₹499)");
    expect(mail.text).toContain("Use code COMEBACK10");
    expect(mail.html).toContain("Urban &lt;Threads&gt;");
    expect(mail.html).toContain("background:#2563eb");
    expect(mail.html).toContain("https://x/stop");
  });
  it("works without a name, code or a safe colour", () => {
    const mail = cartReminderEmail({ ...base, name: null, discountCode: null, color: "red;x" });
    expect(mail.subject).toBe("You left something in your Urban <Threads> cart");
    expect(mail.text).not.toContain("code");
    expect(mail.html).toContain("background:#1d6b5c");
  });
});
