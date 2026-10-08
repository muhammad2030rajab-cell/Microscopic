/**
 * "Since the last visit": turns the per-test comparison into a few reviewer-level insights:
 * sudden jumps (delta check), results that just left the normal range, and results that returned to it.
 * Pure (imports only sibling pure modules), unit-testable with plain node.
 */
import { analyzeDelta } from "./delta-check.ts";
import type { Insight, InsightFlag } from "./clinical-insights.ts";

export interface VisitPair {
  name: string;
  current: number | null;
  previous: number | null;
  currentFlag: InsightFlag;
  previousFlag: InsightFlag;
}

const OUT_OF_RANGE = new Set<InsightFlag>(["high", "low", "abnormal"]);
const MAX_LISTED = 5;

const fmt = (n: number) => String(Math.round(n * 100) / 100);
const list = (items: string[]) => (items.length > MAX_LISTED ? `${items.slice(0, MAX_LISTED).join("، ")} و${items.length - MAX_LISTED} أخرى` : items.join("، "));

export function summarizeVisitChanges(pairs: VisitPair[], daysBetween: number | null): Insight[] {
  const jumps: string[] = [];
  const jumpBasis: string[] = [];
  const worsened: string[] = [];
  const improved: string[] = [];

  for (const p of pairs) {
    if (p.current == null || p.previous == null) continue;
    const d = analyzeDelta({ testName: p.name, previous: p.previous, current: p.current, daysBetween });
    if (d?.severity === "review" && d.pct != null) {
      jumps.push(`${p.name} (${d.pct > 0 ? "+" : ""}${d.pct}%)`);
      jumpBasis.push(`${p.name} ${fmt(p.previous)} → ${fmt(p.current)}`);
    }
    if (p.previousFlag === "normal" && OUT_OF_RANGE.has(p.currentFlag)) worsened.push(p.name);
    else if (OUT_OF_RANGE.has(p.previousFlag) && p.currentFlag === "normal") improved.push(p.name);
  }

  const out: Insight[] = [];
  if (jumps.length) {
    out.push({
      id: "visit-jumps",
      level: "attention",
      title: jumps.length === 1 ? "نتيجة اتغيّرت بشكل مفاجئ عن الزيارة السابقة" : "نتائج اتغيّرت بشكل مفاجئ عن الزيارة السابقة",
      detail: `${list(jumps)}. راجع العينة أو أعد التحليل قبل الاعتماد، فالتغيّر بهذا الحجم قد يعني اختلاط عينة أو خطأ في التحضير.`,
      basis: jumpBasis.slice(0, MAX_LISTED),
    });
  }
  if (worsened.length) {
    out.push({ id: "visit-worsened", level: "attention", title: "نتائج خرجت عن الطبيعي منذ آخر زيارة", detail: `${list(worsened)}. كانت طبيعية في التقرير السابق.`, basis: [] });
  }
  if (improved.length) {
    out.push({ id: "visit-improved", level: "info", title: "نتائج رجعت للطبيعي منذ آخر زيارة", detail: `${list(improved)}. كانت خارج المدى في التقرير السابق.`, basis: [] });
  }
  return out;
}
