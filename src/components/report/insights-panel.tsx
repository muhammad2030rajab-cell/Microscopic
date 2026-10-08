import { useEffect, useState } from "react";
import { interpretResult, parseValue } from "@/lib/medical";
import { analyzeInsights, type Insight, type InsightLevel } from "@/lib/clinical-insights";
import { daysBetween } from "@/lib/delta-check";
import { summarizeVisitChanges } from "@/lib/visit-changes";
import type { Gender } from "@/lib/tests-catalog";
import { cn } from "@/lib/utils";

type Row = { name: string; categoryId: string; value: string; unit: string; customRange?: string };

const STYLE: Record<InsightLevel, string> = {
  urgent: "border-high/40 bg-high-bg text-high",
  attention: "border-line bg-paper-2 text-ink",
  info: "border-line bg-elevated text-ink-soft",
};
const RANK: Record<InsightLevel, number> = { urgent: 0, attention: 1, info: 2 };
const LABEL: Record<InsightLevel, string> = { urgent: "عاجل", attention: "يستحق المراجعة", info: "للعلم" };

/**
 * Whole-report hints for the clinician (anemia type, pancytopenia, thyroid pattern...). Staff only, never printed.
 * `live` = shown while results are being typed: updates settle 0.7s after the last keystroke so half-typed
 * numbers ("1" on the way to "14") never flash a scary hint.
 */
export function InsightsPanel({
  tests, gender, age, rangeFor, live = false, previous, reportDate, className,
}: {
  tests: Row[];
  gender: Gender;
  age: number | undefined;
  rangeFor?: (t: { name: string; categoryId: string }) => string | undefined;
  live?: boolean;
  /** Last approved report of the same patient; adds the "since last visit" insights. */
  previous?: { reportDate: string; values: Record<string, string> } | null;
  reportDate?: string;
  className?: string;
}) {
  const computed = analyzeInsights({
    gender,
    age,
    items: tests.map((t) => ({
      name: t.name,
      categoryId: t.categoryId,
      unit: t.unit,
      value: t.value.trim() ? parseValue(t.value) : null,
      flag: t.value.trim() ? interpretResult(t.name, t.value, gender, t.customRange || rangeFor?.(t), age, t.categoryId).flag : "unknown",
    })),
  });
  if (previous) {
    const pairs = tests.flatMap((t) => {
      const before = previous.values[`${t.categoryId}:${t.name}`];
      if (!t.value.trim() || !before) return [];
      const range = t.customRange || rangeFor?.(t);
      return [{
        name: t.name,
        current: parseValue(t.value),
        previous: parseValue(before),
        currentFlag: interpretResult(t.name, t.value, gender, range, age, t.categoryId).flag,
        previousFlag: interpretResult(t.name, before, gender, range, age, t.categoryId).flag,
      }];
    });
    computed.push(...summarizeVisitChanges(pairs, reportDate ? daysBetween(previous.reportDate, reportDate) : null));
    computed.sort((a, b) => RANK[a.level] - RANK[b.level]);
  }
  // A string signature keeps the effect stable: equal output never re-triggers the timer.
  const sig = JSON.stringify(computed);
  const [settled, setSettled] = useState(sig);
  useEffect(() => {
    if (!live) return;
    const id = setTimeout(() => setSettled(sig), 700);
    return () => clearTimeout(id);
  }, [sig, live]);

  const shown: Insight[] = live ? (JSON.parse(settled) as Insight[]) : computed;
  if (shown.length === 0) return null;

  return (
    <section className={cn("print:hidden", className)} aria-label="ملاحظات ذكية للمراجع" aria-live={live ? "polite" : undefined}>
      <p className="text-sm font-medium">
        ملاحظات ذكية للمراجع <span className="ms-1 rounded-full bg-paper-2 px-2 py-0.5 text-xs text-ink-soft">{shown.length}</span>
      </p>
      <p className="mt-0.5 text-xs text-muted">قراءة لكل النتائج مع بعض. مساعدة للمراجعة الطبية وليست تشخيصًا.</p>
      <ul className="mt-3 space-y-2">
        {shown.map((x) => (
          <li key={x.id} className={cn("rounded-md border px-3 py-2.5", STYLE[x.level])}>
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium">{x.title}</span>
              <span className="shrink-0 text-[11px] font-medium opacity-80">{LABEL[x.level]}</span>
            </div>
            <p className="mt-1 text-xs leading-5">{x.detail}</p>
            {x.basis.length > 0 ? <p dir="ltr" className="mt-1.5 text-start text-[11px] tabular-nums opacity-70">{x.basis.join(" · ")}</p> : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
