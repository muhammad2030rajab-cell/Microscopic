/**
 * Delta check: how suspicious is the change between a patient's previous
 * approved result and the current one?
 *
 * A big jump in a physiologically stable analyte (hemoglobin, creatinine,
 * sodium...) over a short time is a classic sign of a mislabelled or
 * contaminated sample, so the reviewer should re-check before approving.
 * Volatile analytes (CRP, glucose, WBC...) are allowed to move much more.
 *
 * Pure functions, no imports, so they can be unit-tested with plain node.
 */

export type DeltaSeverity = "none" | "notable" | "review";
export type DeltaDirection = "up" | "down" | "same";
export type Volatility = "stable" | "normal" | "volatile";

export interface DeltaResult {
  direction: DeltaDirection;
  /** Signed percent change vs the previous value; null when previous is 0. */
  pct: number | null;
  severity: DeltaSeverity;
  volatility: Volatility;
}

/** % change at which a result becomes "notable" / "worth re-checking". */
const THRESHOLDS: Record<Volatility, { notable: number; review: number }> = {
  stable: { notable: 10, review: 25 },
  normal: { notable: 25, review: 50 },
  volatile: { notable: 60, review: 100 },
};

const STABLE = /hemoglobin|hgb|\bhb\b|hematocrit|hct|creatinine|sodium|\bna\b|chloride|calcium|albumin|total protein|mcv|\bmch\b|هيموجلوبين|كرياتينين|صوديوم|كالسيوم|ألبومين|البومين/i;
const VOLATILE = /crp|c-reactive|glucose|sugar|wbc|white blood|neutrophil|lymphocyte|esr|triglyceride|bilirubin|ast\b|alt\b|sgot|sgpt|ck-?mb|troponin|d-?dimer|سكر|جلوكوز|كرات الدم البيضاء|دهون ثلاثية/i;

export function classifyVolatility(testName: string): Volatility {
  if (STABLE.test(testName)) return "stable";
  if (VOLATILE.test(testName)) return "volatile";
  return "normal";
}

/**
 * Longer gaps between visits make big changes more plausible, very short gaps
 * make them less plausible, so thresholds stretch/shrink with the gap.
 */
export function timeFactor(daysBetween: number | null | undefined): number {
  if (daysBetween == null || !Number.isFinite(daysBetween) || daysBetween < 0) return 1;
  if (daysBetween <= 7) return 0.7;
  if (daysBetween >= 180) return 1.5;
  return 1;
}

export function daysBetween(fromIso: string, toIso: string): number | null {
  const a = Date.parse(fromIso);
  const b = Date.parse(toIso);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.floor((b - a) / 86_400_000);
}

export function analyzeDelta(input: {
  testName: string;
  previous: number;
  current: number;
  daysBetween?: number | null;
}): DeltaResult | null {
  const { testName, previous, current } = input;
  if (!Number.isFinite(previous) || !Number.isFinite(current)) return null;

  const volatility = classifyVolatility(testName);
  const direction: DeltaDirection = current > previous ? "up" : current < previous ? "down" : "same";
  if (direction === "same") return { direction, pct: 0, severity: "none", volatility };

  // Going from 0 to anything has no meaningful percentage; don't guess.
  if (previous === 0) return { direction, pct: null, severity: "none", volatility };

  const pct = ((current - previous) / Math.abs(previous)) * 100;
  const k = timeFactor(input.daysBetween);
  const t = THRESHOLDS[volatility];
  const abs = Math.abs(pct);
  const severity: DeltaSeverity = abs >= t.review * k ? "review" : abs >= t.notable * k ? "notable" : "none";
  return { direction, pct: Math.round(pct * 10) / 10, severity, volatility };
}
