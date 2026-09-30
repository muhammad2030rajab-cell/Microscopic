import { code128Layout } from "@/lib/code128";

const QUIET = 10; // modules of white space each side (Code 128 requires >= 10)
const HEIGHT = 36;

/**
 * Scannable Code 128 barcode for the sample id. Always black on white,
 * whatever the theme, because scanners need the contrast. Renders nothing
 * (rather than a wrong barcode) if the value cannot be encoded.
 */
export function SampleBarcode({ value }: { value: string }) {
  let layout;
  try {
    layout = code128Layout(value);
  } catch {
    return null;
  }
  const width = layout.width + QUIET * 2;
  const d = layout.bars.map((b) => `M${b.x + QUIET} 0h${b.w}v${HEIGHT}h-${b.w}z`).join("");

  return (
    <svg
      className="lab-barcode-svg"
      viewBox={`0 0 ${width} ${HEIGHT}`}
      preserveAspectRatio="none"
      shapeRendering="crispEdges"
      role="img"
      aria-label={`Barcode ${value}`}
    >
      <rect width={width} height={HEIGHT} fill="#fff" />
      <path d={d} fill="#000" />
    </svg>
  );
}
