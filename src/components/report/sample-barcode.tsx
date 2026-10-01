import { useEffect, useRef } from "react";

/**
 * باركود Code128 حقيقي وقابل للمسح بأي قارئ باركود معملي عادي، بدل شريط زخرفي
 * وهمي. بيتولّد في المتصفح فقط (بدون أي اتصال شبكة).
 */
export function SampleBarcode({ value }: { value: string }) {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!value) return;
    let cancelled = false;
    import("jsbarcode").then(({ default: JsBarcode }) => {
      if (cancelled || !svgRef.current) return;
      try {
        JsBarcode(svgRef.current, value, {
          format: "CODE128",
          displayValue: false,
          margin: 0,
          height: 28,
          width: 1.4,
        });
      } catch {
        // قيمة غير صالحة لترميز Code128 — نسيب الـ SVG فاضي بهدوء.
      }
    });
    return () => {
      cancelled = true;
    };
  }, [value]);

  if (!value) return null;
  return <svg ref={svgRef} className="lab-barcode-svg" role="img" aria-label={`باركود العينة ${value}`} />;
}
