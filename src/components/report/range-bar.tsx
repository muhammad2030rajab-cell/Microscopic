import { parseRange, parseValue, type Flag } from "@/lib/medical";
import { rangeGeometry } from "@/lib/range-position";
import { cn } from "@/lib/utils";

/**
 * Thin bar under the reference interval: the green zone is the normal range,
 * the dot is where this patient's result falls. Purely visual (aria-hidden) —
 * the numeric result, flag and range text already carry the meaning.
 * Renders nothing for qualitative or unparsable results.
 */
export function RangeBar({
  range,
  value,
  flag,
  critical,
}: {
  range: string;
  value: string;
  flag: Flag;
  critical: boolean;
}) {
  // Only plain numbers: "2-4" (cells/HPF) or "+++" must not be plotted as 2.
  if (!/^\s*-?\d+(?:\.\d+)?\s*$/.test(value)) return null;
  const parsed = parseRange(range);
  const n = parseValue(value);
  if (!parsed || n == null) return null;

  const g = rangeGeometry(parsed, n);
  if (!g) return null;

  const tone =
    critical || flag === "high" || flag === "abnormal"
      ? "lab-rbar-dot-high"
      : flag === "low"
        ? "lab-rbar-dot-low"
        : "lab-rbar-dot-ok";

  // Label the two ends of the normal zone when there is room for both numbers.
  const showEnds = parsed.min != null && parsed.max != null && g.zoneEnd - g.zoneStart >= 30;

  return (
    <>
    <div className="lab-rbar" aria-hidden>
      <span
        className="lab-rbar-zone"
        style={{
          left: `${g.zoneStart}%`,
          width: `${Math.max(0, g.zoneEnd - g.zoneStart)}%`,
        }}
      />
      <span
        className={cn("lab-rbar-dot", tone, g.offScale && "lab-rbar-dot-off")}
        style={{ left: `${g.marker}%` }}
      />
    </div>
    {showEnds ? (
      <div className="lab-rbar-ends" aria-hidden dir="ltr">
        <span style={{ left: `${g.zoneStart}%` }}>{parsed.min}</span>
        <span style={{ left: `${g.zoneEnd}%` }}>{parsed.max}</span>
      </div>
    ) : null}
    </>
  );
}
