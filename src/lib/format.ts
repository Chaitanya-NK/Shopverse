/** "Urban Threads Retail" -> "UT"; "priya@x.com" -> "PR". */
export function initials(value: string): string {
  const words = value
    .trim()
    .split(/[\s@._-]+/)
    .filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0]!.slice(0, 2).toUpperCase();
  return (words[0]![0]! + words[1]![0]!).toUpperCase();
}

/** Currency formatting using Indian digit grouping for INR (₹1,23,456). */
export function formatMoney(
  amount: number,
  currency = "INR",
  options?: { compact?: boolean },
): string {
  return new Intl.NumberFormat(currency === "INR" ? "en-IN" : "en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: options?.compact ? 1 : 0,
    notation: options?.compact ? "compact" : "standard",
  }).format(amount);
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-IN").format(value);
}
