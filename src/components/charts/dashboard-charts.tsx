import type { LabDashboardCharts } from "@/lib/lab-access";

const PALETTE = ["#2f6fed", "#1fb6c9", "#f59e0b", "#1f9d55", "#8b5cf6"];
const DAY_NAMES = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];

function dayLabel(day: string) {
  const d = new Date(`${day}T12:00:00`);
  return DAY_NAMES[d.getDay()] ?? day;
}

/** "إحصائيات التحاليل": reports per day over the last 7 days. */
export function WeeklyBars({ data }: { data: LabDashboardCharts["daily"] }) {
  const max = Math.max(1, ...data.map((d) => d.count));
  return (
    <div className="flex h-44 items-end gap-2" dir="rtl">
      {data.map((d, i) => (
        <div key={d.day} className="flex h-full flex-1 flex-col items-center justify-end gap-1.5">
          <span className="text-[11px] font-semibold tabular-nums text-ink-soft">{d.count}</span>
          <div className="flex w-full flex-1 items-end">
            <div
              className="w-full rounded-t-md"
              style={{
                height: `${Math.max(4, (d.count / max) * 100)}%`,
                background: i === data.length - 1 ? "var(--color-teal-deep)" : "var(--color-teal)",
                opacity: i === data.length - 1 ? 1 : 0.8,
              }}
            />
          </div>
          <span className="max-w-full truncate text-[10px] text-muted">{dayLabel(d.day)}</span>
        </div>
      ))}
    </div>
  );
}

/** "أنواع التحاليل": donut of the most requested categories. */
export function CategoryDonut({ data }: { data: LabDashboardCharts["categories"] }) {
  const total = data.reduce((s, d) => s + d.count, 0);
  const r = 15.9155; // circumference = 100
  let offset = 25; // start at 12 o'clock
  return (
    <div className="flex items-center gap-4">
      <svg viewBox="0 0 42 42" className="size-32 shrink-0 -scale-x-100" role="img" aria-label="أنواع التحاليل">
        <circle cx="21" cy="21" r={r} fill="none" stroke="var(--color-paper-2)" strokeWidth="6" />
        {total > 0
          ? data.map((d, i) => {
              const pct = (d.count / total) * 100;
              const el = (
                <circle
                  key={d.name}
                  cx="21"
                  cy="21"
                  r={r}
                  fill="none"
                  stroke={PALETTE[i % PALETTE.length]}
                  strokeWidth="6"
                  strokeDasharray={`${pct} ${100 - pct}`}
                  strokeDashoffset={offset}
                />
              );
              offset -= pct;
              return el;
            })
          : null}
      </svg>
      <ul className="min-w-0 flex-1 space-y-1.5">
        {data.map((d, i) => (
          <li key={d.name} className="flex items-center gap-2 text-xs">
            <span className="size-2.5 shrink-0 rounded-full" style={{ background: PALETTE[i % PALETTE.length] }} />
            <span className="min-w-0 flex-1 truncate text-ink-soft">{d.name}</span>
            <span className="font-semibold tabular-nums">{Math.round((d.count / Math.max(1, total)) * 100)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
