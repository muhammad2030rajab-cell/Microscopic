import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { Search, SlidersHorizontal } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { FlagDot } from "@/components/report/flag-badge";
import { Input } from "@/components/ui/input";
import { interpretResult } from "@/lib/medical";
import { listLabReports } from "@/lib/lab-reports";
import { formatArDate } from "@/lib/utils";
import { reportStatusClasses, reportStatusLabels } from "@/lib/report-workflow";

type LabReportSummary = Awaited<ReturnType<typeof listLabReports>>[number];

export const Route = createFileRoute("/reports/")({
  loader: async () => {
    try {
      return { reports: await listLabReports() };
    } catch {
      return { reports: null as LabReportSummary[] | null };
    }
  },
  component: ReportsPage,
});

function ReportsPage() {
  const { reports } = Route.useLoaderData();
  if (!reports) return <Navigate to="/login" replace />;
  return <ReportsList reports={reports} />;
}

function ReportsList({ reports }: { reports: LabReportSummary[] }) {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"all" | "draft" | "pending_review" | "approved" | "cancelled">("all");
  const [period, setPeriod] = useState<"all" | "month" | "year">("all");

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    const now = new Date();
    return reports.filter((r) => {
      const matchesStatus = status === "all" || r.status === status;
      const matchesText = !t || [r.patientName, r.doctor, r.id, r.patientCode, r.sampleId].some((v) => v.toLowerCase().includes(t));
      const created = new Date(r.createdAt);
      const matchesPeriod =
        period === "all" ||
        (period === "year" && created.getFullYear() === now.getFullYear()) ||
        (period === "month" && created.getFullYear() === now.getFullYear() && created.getMonth() === now.getMonth());
      return matchesStatus && matchesText && matchesPeriod;
    });
  }, [q, reports, status, period]);

  return (
    <AppShell>
      <header className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-muted">الأرشيف</p>
          <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight">التقارير</h1>
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
          <div className="relative w-full sm:w-72">
            <Search className="pointer-events-none absolute top-3.5 start-3 size-4 text-muted" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="بحث باسم المريض أو الكود أو العينة"
              className="ps-9"
            />
          </div>
          <label className="relative block">
            <SlidersHorizontal className="pointer-events-none absolute top-3.5 start-3 size-4 text-muted" />
            <select value={status} onChange={(e) => setStatus(e.target.value as typeof status)} className="h-11 w-full appearance-none rounded-lg border border-line bg-elevated ps-9 pe-8 text-sm outline-none focus:border-teal sm:w-48">
              <option value="all">كل الحالات</option>
              <option value="draft">مسودة</option>
              <option value="pending_review">في انتظار المراجعة</option>
              <option value="approved">معتمد</option>
              <option value="cancelled">ملغي</option>
            </select>
          </label>
        </div>
      </header>

      <div className="mb-4 flex flex-wrap gap-2">
        <PeriodChip active={period === "year"} onClick={() => setPeriod(period === "year" ? "all" : "year")}>هذا العام</PeriodChip>
        <PeriodChip active={period === "month"} onClick={() => setPeriod(period === "month" ? "all" : "month")}>هذا الشهر</PeriodChip>
        <PeriodChip active={period === "all"} onClick={() => setPeriod("all")}>الكل</PeriodChip>
      </div>

      <div className="mb-3 flex items-center justify-between text-xs text-muted">
        <span>عرض {filtered.length} من {reports.length} تقرير</span>
        {(q || status !== "all" || period !== "all") ? <button type="button" onClick={() => { setQ(""); setStatus("all"); setPeriod("all"); }} className="font-medium text-teal hover:underline">مسح الفلاتر</button> : null}
      </div>

      {filtered.length === 0 ? (
        <p className="rounded-lg border border-dashed border-line px-4 py-12 text-center text-sm text-muted">
          لا توجد تقارير مطابقة.
        </p>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-elevated">
          {filtered.map((r) => {
            const flags = r.tests.map((t) =>
              interpretResult(t.name, t.value, r.gender, t.customRange),
            );
            const bad = flags.filter(
              (f) => f.flag === "high" || f.flag === "low" || f.flag === "abnormal",
            ).length;
            return (
              <li key={r.id} className="flex items-stretch">
                <Link
                  to="/reports/$id"
                  params={{ id: r.id }}
                  className="flex min-w-0 flex-1 items-center gap-3 px-4 py-3.5 hover:bg-paper-2/50"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{r.patientName}</p>
                    <p className="text-xs text-muted">
                      {r.age} {r.gender} · {r.doctor} · {formatArDate(r.createdAt)}
                    </p>
                  </div>
                  <span className={`hidden rounded-full px-2 py-1 text-[11px] sm:inline ${reportStatusClasses[r.status]}`}>{reportStatusLabels[r.status]}</span>
                  <span className="hidden text-xs text-muted sm:inline">{r.tests.length} تحليل</span>
                  <span className="inline-flex items-center gap-1.5 text-xs">
                    <FlagDot flag={bad ? "high" : "normal"} />
                    {bad ? `${bad} علامة` : "طبيعي"}
                  </span>
                </Link>

              </li>
            );
          })}
        </ul>
      )}
    </AppShell>
  );
}

function PeriodChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`h-9 rounded-full px-4 text-sm font-medium transition ${
        active ? "bg-teal text-teal-fg" : "border border-line bg-elevated text-ink-soft hover:border-teal/40"
      }`}
    >
      {children}
    </button>
  );
}
