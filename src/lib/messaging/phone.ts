/**
 * A phone number as E.164 (+919876543210), assuming India for 10-digit
 * mobiles. Null when it can't be a mobile number.
 */
export function toE164(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/[^\d+]/g, "");
  if (/^\+[1-9]\d{7,14}$/.test(digits)) return digits;
  const bare = digits.replace(/^\+/, "");
  if (/^[6-9]\d{9}$/.test(bare)) return `+91${bare}`;
  if (/^0[6-9]\d{9}$/.test(bare)) return `+91${bare.slice(1)}`;
  if (/^91[6-9]\d{9}$/.test(bare)) return `+${bare}`;
  return null;
}

/** "+919876543210" -> "+91 98765 •••10" for logs shown to staff. */
export function maskPhone(e164: string): string {
  return e164.length > 8 ? `${e164.slice(0, -6)}••••${e164.slice(-2)}` : e164;
}
