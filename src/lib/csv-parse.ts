/**
 * RFC 4180 CSV reader for spreadsheet uploads. Handles quoted fields with
 * commas, quotes ("") and line breaks; CRLF or LF line ends; a UTF-8 BOM; and
 * the apostrophe our own exports put in front of formula-like text.
 */
export class CsvParseError extends Error {}

export function parseCsv(input: string): string[][] {
  const text = input.replace(/^﻿/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  let wasQuoted = false;
  let line = 1;

  const endField = () => {
    row.push(wasQuoted ? field : field.trim());
    field = "";
    wasQuoted = false;
  };
  const endRow = () => {
    endField();
    if (row.length > 1 || row[0] !== "") rows.push(row);
    row = [];
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else {
        if (ch === "\n") line++;
        field += ch;
      }
      continue;
    }
    if (ch === '"' && field.trim() === "") {
      quoted = true;
      wasQuoted = true;
      field = "";
    } else if (ch === ",") endField();
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      endRow();
      line++;
    } else field += ch;
  }
  if (quoted)
    throw new CsvParseError(`A quoted value starting before line ${line} is never closed.`);
  if (field !== "" || row.length > 0) endRow();
  return rows;
}

/** Undo the apostrophe our CSV export adds so spreadsheets don't run text as a formula. */
export function unescapeCell(value: string): string {
  return /^'[=+\-@\t\r]/.test(value) ? value.slice(1) : value;
}

/** Rows as objects keyed by the (lower-cased, trimmed) header row. */
export function parseCsvRecords(input: string): {
  headers: string[];
  records: Record<string, string>[];
} {
  const [head, ...rows] = parseCsv(input);
  if (!head) return { headers: [], records: [] };
  const headers = head.map((h) => h.trim().toLowerCase());
  const records = rows.map((cells) =>
    Object.fromEntries(headers.map((h, i) => [h, unescapeCell(cells[i] ?? "")])),
  );
  return { headers, records };
}
