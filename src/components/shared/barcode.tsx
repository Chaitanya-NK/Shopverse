import { code128Widths } from "@/lib/barcodes/code128";
import { ean13Modules, normalizeEan13 } from "@/lib/barcodes/ean13";
import { cn } from "@/lib/utils";

type BarcodeProps = {
  value: string;
  /** "auto": EAN-13 when the value is a valid EAN/UPC, otherwise Code 128. */
  format?: "auto" | "code128" | "ean13";
  /** Bar height in modules (the SVG scales to its container's width). */
  height?: number;
  showText?: boolean;
  className?: string;
};

/** A scannable barcode as crisp SVG (prints sharply at any size). */
export function Barcode({
  value,
  format = "auto",
  height = 40,
  showText = true,
  className,
}: BarcodeProps) {
  const ean = format !== "code128" ? normalizeEan13(value) : null;
  let bars: { x: number; w: number }[] = [];
  let width = 0;
  if (ean) {
    const modules = ean13Modules(ean);
    for (let i = 0; i < modules.length; i++) if (modules[i] === "1") bars.push({ x: i, w: 1 });
    width = modules.length;
  } else {
    let x = 0;
    code128Widths(value).forEach((w, i) => {
      if (i % 2 === 0) bars.push({ x, w });
      x += w;
    });
    width = x;
  }
  // Merge adjacent modules into single rectangles.
  bars = bars.reduce<{ x: number; w: number }[]>((acc, b) => {
    const last = acc.at(-1);
    if (last && last.x + last.w === b.x) last.w += b.w;
    else acc.push({ ...b });
    return acc;
  }, []);
  const quiet = 10;
  const total = width + quiet * 2;
  const text = ean ?? value;
  return (
    <svg
      role="img"
      aria-label={`Barcode ${text}`}
      viewBox={`0 0 ${total} ${height + (showText ? 12 : 0)}`}
      className={cn("block h-auto w-full", className)}
      shapeRendering="crispEdges"
    >
      <rect width={total} height={height + (showText ? 12 : 0)} fill="#fff" />
      {bars.map((b) => (
        <rect key={b.x} x={b.x + quiet} y={0} width={b.w} height={height} fill="#000" />
      ))}
      {showText && (
        <text
          x={total / 2}
          y={height + 10}
          textAnchor="middle"
          fontSize={9}
          fontFamily="ui-monospace, monospace"
          fill="#000"
        >
          {text}
        </text>
      )}
    </svg>
  );
}
