/**
 * CSV for spreadsheets. Text that a spreadsheet would run as a formula
 * (starting with = + - @ or a tab/CR) gets a leading apostrophe, so a product
 * called "=HYPERLINK(...)" stays text. Numbers are written as numbers, and
 * international phone numbers (+91…) are left as they are.
 */
export type CsvValue = string | number | boolean | null | undefined;

const FORMULA = /^[=+\-@\t\r]/;
/** A phone number like +919876543210 can't run anything; leave it readable. */
const PHONE = /^\+\d{6,15}$/;

export function csvCell(value: CsvValue): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  let text = value;
  if (FORMULA.test(text) && !PHONE.test(text)) text = `'${text}`;
  if (/[",\r\n]/.test(text)) text = `"${text.replaceAll('"', '""')}"`;
  return text;
}

/** Header row plus data rows, CRLF line ends, with a BOM so Excel reads ₹ and names correctly. */
export function toCsv(headers: readonly string[], rows: readonly (readonly CsvValue[])[]): string {
  const lines = [headers, ...rows].map((row) => row.map(csvCell).join(","));
  return `﻿${lines.join("\r\n")}\r\n`;
}

/** A safe download name: letters, digits and dashes. */
export function csvFilename(...parts: string[]): string {
  const name = parts
    .join("-")
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return `${name || "export"}.csv`;
}
