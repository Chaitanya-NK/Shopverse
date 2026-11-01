import { describe, expect, it } from "vitest";

import { type Digest, digestTasks } from "@/features/operations/digest";
import { digestEmail, lowStockEmail } from "@/features/operations/emails";

const item = {
  product_title: "Classic <tee>",
  variant_title: "M",
  sku: "TEE-M",
  warehouse_name: "Pune",
  available: 2,
  reorder_point: 5,
};
const digest: Digest = {
  day: "2026-10-27",
  sales: { orders: 3, total: 1547 },
  to_confirm: 1,
  to_pack: 2,
  out_for_delivery: 0,
  failed_attempts: 0,
  returns_to_review: 0,
  low_stock: { count: 1, items: [item] },
  purchase_orders: { due_today: 0, overdue: 1 },
};

describe("operations emails", () => {
  it("names a single low-stock item and escapes it", () => {
    const mail = lowStockEmail({
      to: "a@b.in",
      businessName: "Urban Threads",
      items: [item],
      purchasingUrl: "https://x/p",
    });
    expect(mail.subject).toBe("Low stock: Classic <tee> · M");
    expect(mail.html).toContain("Classic &lt;tee&gt;");
    expect(mail.html).not.toContain("<tee>");
    expect(mail.text).toContain("TEE-M), Pune: 2 left, reorder at 5");
  });

  it("counts several low-stock items in the subject", () => {
    const mail = lowStockEmail({
      to: "a@b.in",
      businessName: "Urban Threads",
      items: [item, { ...item, sku: "TEE-L", variant_title: "L" }],
      purchasingUrl: "https://x/p",
    });
    expect(mail.subject).toBe("Low stock: 2 items at Urban Threads");
  });

  it("lists only the tasks that need someone", () => {
    expect(digestTasks(digest).map((t) => t.label)).toEqual([
      "order to confirm",
      "orders to pack",
      "purchase order overdue",
      "item low on stock",
    ]);
    const mail = digestEmail({
      to: "a@b.in",
      businessName: "Urban Threads",
      digest,
      dashboardUrl: "https://x/d",
      purchasingUrl: "https://x/p",
    });
    expect(mail.subject).toBe("Urban Threads: 3 orders, ₹1,547 yesterday");
    expect(mail.text).toContain("Tuesday, 27 October");
    expect(mail.text).toContain("- 2 orders to pack");
  });

  it("says when nothing is waiting", () => {
    const quiet = {
      ...digest,
      to_confirm: 0,
      to_pack: 0,
      low_stock: { count: 0, items: [] },
      purchase_orders: { due_today: 0, overdue: 0 },
    };
    expect(
      digestEmail({
        to: "a",
        businessName: "B",
        digest: quiet,
        dashboardUrl: "d",
        purchasingUrl: "p",
      }).text,
    ).toContain("Nothing is waiting for you today.");
  });
});
