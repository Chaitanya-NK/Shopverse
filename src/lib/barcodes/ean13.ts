/** EAN-13 (and UPC-A as a leading-zero EAN-13): the barcodes printed on retail packs. */

const L = [
  "0001101",
  "0011001",
  "0010011",
  "0111101",
  "0100011",
  "0110001",
  "0101111",
  "0111011",
  "0110111",
  "0001011",
];
const G = [
  "0100111",
  "0110011",
  "0011011",
  "0100001",
  "0011101",
  "0111001",
  "0000101",
  "0010001",
  "0001001",
  "0010111",
];
const R = [
  "1110010",
  "1100110",
  "1101100",
  "1000010",
  "1011100",
  "1001110",
  "1010000",
  "1000100",
  "1001000",
  "1110100",
];
// Which of the first six digits use G instead of L, chosen by the leading digit.
const PARITY = [
  "LLLLLL",
  "LLGLGG",
  "LLGGLG",
  "LLGGGL",
  "LGLLGG",
  "LGGLLG",
  "LGGGLL",
  "LGLGLG",
  "LGLGGL",
  "LGGLGL",
];

/** The check digit for the first 12 digits. */
export function ean13CheckDigit(first12: string): number {
  const sum = [...first12].reduce((n, d, i) => n + Number(d) * (i % 2 === 0 ? 1 : 3), 0);
  return (10 - (sum % 10)) % 10;
}

/** A 13-digit code with a correct check digit (or 12-digit UPC-A, treated as 0 + UPC). */
export function normalizeEan13(code: string): string | null {
  const digits = code.trim();
  const ean = /^\d{12}$/.test(digits) ? `0${digits}` : digits;
  if (!/^\d{13}$/.test(ean)) return null;
  return ean13CheckDigit(ean.slice(0, 12)) === Number(ean[12]) ? ean : null;
}

/** 95 modules: "1" bar, "0" space. */
export function ean13Modules(code: string): string {
  const ean = normalizeEan13(code);
  if (!ean) throw new Error("Not a valid EAN-13");
  const parity = PARITY[Number(ean[0])]!;
  let bits = "101";
  for (let i = 1; i <= 6; i++) bits += (parity[i - 1] === "L" ? L : G)[Number(ean[i])];
  bits += "01010";
  for (let i = 7; i <= 12; i++) bits += R[Number(ean[i])];
  return bits + "101";
}
