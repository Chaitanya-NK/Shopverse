/**
 * Code 128 barcodes (subsets B and C), the format couriers use for AWBs and
 * most label printers read. Digits in pairs use subset C (half the width);
 * everything else uses B. Returns bar/space widths in modules, starting with
 * a bar, ending with the stop pattern (no quiet zones).
 */

// Bar/space widths for symbol values 0–106 (106 = stop, 7 elements).
export const PATTERNS = [
  "212222",
  "222122",
  "222221",
  "121223",
  "121322",
  "131222",
  "122213",
  "122312",
  "132212",
  "221213",
  "221312",
  "231212",
  "112232",
  "122132",
  "122231",
  "113222",
  "123122",
  "123221",
  "223211",
  "221132",
  "221231",
  "213212",
  "223112",
  "312131",
  "311222",
  "321122",
  "321221",
  "312212",
  "322112",
  "322211",
  "212123",
  "212321",
  "232121",
  "111323",
  "131123",
  "131321",
  "112313",
  "132113",
  "132311",
  "211313",
  "231113",
  "231311",
  "112133",
  "112331",
  "132131",
  "113123",
  "113321",
  "133121",
  "313121",
  "211331",
  "231131",
  "213113",
  "213311",
  "213131",
  "311123",
  "311321",
  "331121",
  "312113",
  "312311",
  "332111",
  "314111",
  "221411",
  "431111",
  "111224",
  "111422",
  "121124",
  "121421",
  "141122",
  "141221",
  "112214",
  "112412",
  "122114",
  "122411",
  "142112",
  "142211",
  "241211",
  "221114",
  "413111",
  "241112",
  "134111",
  "111242",
  "121142",
  "121241",
  "114212",
  "124112",
  "124211",
  "411212",
  "421112",
  "421211",
  "212141",
  "214121",
  "412121",
  "111143",
  "111341",
  "131141",
  "114113",
  "114311",
  "411113",
  "411311",
  "113141",
  "114131",
  "311141",
  "411131",
  "211412",
  "211214",
  "211232",
  "2331112",
] as const;

const START_B = 104;
const START_C = 105;
const CODE_B = 100;
const CODE_C = 99;
const STOP = 106;

const isPrintable = (text: string) => /^[\x20-\x7E]*$/.test(text);

/** Symbol values (start, data, checksum, stop) for the text. */
export function code128Values(text: string): number[] {
  if (text.length === 0 || text.length > 80 || !isPrintable(text))
    throw new Error("Code 128 needs 1–80 printable ASCII characters");

  // Use C for runs of 4+ digits (or a whole even-length number).
  const digitRun = (i: number) => {
    let j = i;
    while (j < text.length && text[j]! >= "0" && text[j]! <= "9") j++;
    return j - i;
  };
  const values: number[] = [];
  let set: "B" | "C";
  let i = 0;
  const first = digitRun(0);
  if (first >= 4 || (first === text.length && first % 2 === 0)) {
    set = "C";
    values.push(START_C);
  } else {
    set = "B";
    values.push(START_B);
  }
  while (i < text.length) {
    const run = digitRun(i);
    if (set === "B" && run >= 4) {
      // Switch to C for an even number of the digits; an odd leading digit stays in B.
      if (run % 2 === 1) {
        values.push(text.charCodeAt(i) - 32);
        i++;
      }
      values.push(CODE_C);
      set = "C";
      continue;
    }
    if (set === "C") {
      if (run >= 2) {
        values.push(Number(text.slice(i, i + 2)));
        i += 2;
        continue;
      }
      values.push(CODE_B);
      set = "B";
      continue;
    }
    values.push(text.charCodeAt(i) - 32);
    i++;
  }
  const checksum = values.reduce((sum, v, idx) => sum + v * (idx === 0 ? 1 : idx), 0) % 103;
  values.push(checksum, STOP);
  return values;
}

/** Module widths, alternating bar and space, starting with a bar. */
export function code128Widths(text: string): number[] {
  return code128Values(text).flatMap((v) => [...PATTERNS[v]!].map(Number));
}
