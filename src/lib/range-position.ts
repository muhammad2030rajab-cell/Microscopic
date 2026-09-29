/**
 * Geometry for the little reference-range bar shown under each result.
 * Pure functions, no imports, so they can be unit-tested with plain node.
 *
 * All returned numbers are percentages (0-100) of the bar width.
 */

export interface BarRange {
  min?: number;
  max?: number;
}

export interface RangeGeometry {
  /** Where the normal (reference) zone starts / ends. */
  zoneStart: number;
  zoneEnd: number;
  /** Where the patient's value sits, pinned to the bar edges when off-scale. */
  marker: number;
  /** True when the value fell outside the drawn scale and was pinned. */
  offScale: boolean;
}

const EDGE = 2; // keep the marker fully inside the bar

export function rangeGeometry(
  range: BarRange,
  value: number,
): RangeGeometry | null {
  const { min, max } = range;
  if (!Number.isFinite(value)) return null;

  let lo: number;
  let hi: number;
  let zoneLo: number;
  let zoneHi: number;

  if (min != null && max != null) {
    if (!(max > min)) return null;
    const span = max - min;
    lo = min - span * 0.75;
    hi = max + span * 0.75;
    if (min >= 0 && lo < 0) lo = 0;
    zoneLo = min;
    zoneHi = max;
  } else if (max != null) {
    if (!(max > 0)) return null;
    lo = 0;
    hi = max * 1.6;
    zoneLo = 0;
    zoneHi = max;
  } else if (min != null) {
    if (!(min > 0)) return null;
    lo = 0;
    hi = min * 2;
    zoneLo = min;
    zoneHi = hi;
  } else {
    return null;
  }

  const pct = (x: number) => ((x - lo) / (hi - lo)) * 100;
  const raw = pct(value);
  const marker = Math.min(100 - EDGE, Math.max(EDGE, raw));

  return {
    zoneStart: pct(zoneLo),
    zoneEnd: pct(zoneHi),
    marker,
    offScale: raw < 0 || raw > 100,
  };
}
