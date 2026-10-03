import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { Loader2, Search, SlidersHorizontal, Trash2, TriangleAlert } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { FlagDot } from "@/components/report/flag-badge";
import { formatAge } from "@/lib/age";
import { matchesSearch } from "@/lib/search-text";
import { loadReportFilters, saveReportFilters, type ReportPeriodFilter, type ReportStatusFilter } from "@/lib/reports-filters";
import { Input } from "@/components/ui/input";
import { deleteLabReport, listLabReports } from "@/lib/lab-reports";
import { getCurrentLabPermissions } from "@/lib/lab-users";
import { formatListDate } from "@/lib/utils";
import { reportStatusClasses, reportStatusLabels } from "@/lib/report-workflow";

type LabReportSummary = Awaited<ReturnType<typeof listLabReports>>[number];

export const Route = createFileRoute("/reports/")({
  loader: async () => {
    try {
      const [reports, access] = await Promise.all([listLabReports(), getCurrentLabPermissions().catch(() => null)]);
      return { reports, canDelete: access?.permissions["reports.delete"] === true, isOwner: access?.role === "owner" };
    } catch {
      return { reports: null as LabReportSummary[] | null, canDelete: false, isOwner: false };
    }
  },
  component: ReportsPage,
});

function ReportsPage() {
  const { reports, canDelete, isOwner } = Route.useLoaderData();
  if (!reports) return <Navigate to="/login" replace />;
  return <ReportsList initialReports={reports} canDelete={canDelete} isOwner={isOwner} />;
}

function ReportsList({ initialReports, canDelete, isOwner }: { initialReports: LabReportSummary[]; canDelete: boolean; isOwner: boolean }) {
  const [reports, setReports] = useState(initialReports);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState("");

  async function removeReport(r: LabReportSummary) {
    const message = r.status === "approved"
      ? `تقرير "${r.patientName}" معتمد. حذفه نهائي ولا يمكن استرجاعه، وسيُسجَّل في سجل المراجعة. هل تريد المتابعة؟`
      : `هل أنت متأكد من حذف تقرير "${r.patientName}"؟ لا يمكن التراجع عن هذا الإجراء.`;
    if (!window.confirm(message)) return;
    setDeleteError("");
    setDeletingId(r.id);
    try {
      await deleteLabReport({ data: { id: r.id } });
      setReports((current) => current.filter((x) => x.id !== r.id));
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "تعذر حذف التقرير");
    } finally {
      setDeletingId(null);
    }
  }

  const [q, setQ] = useState("");
  const [status, setStatus] = useState<ReportStatusFilter>("all");
  const [period, setPeriod] = useState<ReportPeriodFilter>("all");
  const [onlyCritical, setOnlyCritical] = useState(false);

  // Coming back from a report should keep the filters. Restored after mount so
  // the server-rendered HTML and the first client render match.
  useEffect(() => {
    const saved = loadReportFilters();
    if (saved.q !== undefined) setQ(saved.q);
    if (saved.status) setStatus(saved.status);
    if (saved.period) setPeriod(saved.period);
    if (saved.onlyCritical !== undefined) setOnlyCritical(saved.onlyCritical);
  }, []);
  useEffect(() => {
    saveReportFilters({ q, status, period, onlyCritical });
  }, [q, status, period, onlyCritical]);

  const criticalTotal = useMemo(() => reports.filter((r) => r.criticalCount > 0).length, [reports]);

  const statusCounts = useMemo(() => {
    const c = { draft: 0, pending_review: 0, approved: 0, cancelled: 0 };
    for (const r of reports) c[r.status] += 1;
    return c;
  }, [reports]);

  const filtered = useMemo(() => {
    const now = new Date();
    return reports.filter((r) => {
      const matchesStatus = status === "all" || r.status === status;
      // Arabic-aware: "احمد" finds "أحمد"; Arabic digits match Latin ones; word order is free.
      const matchesText = matchesSearch(q, r.patientName, r.doctor, r.id, r.patientCode, r.sampleId, r.phone, r.nationalId);
      const created = new Date(r.createdAt);
      const sameMonth = created.getFullYear() === now.getFullYear() && created.getMonth() === now.getMonth();
      const matchesPeriod =
        period === "all" ||
        (period === "year" && created.getFullYear() === now.getFullYear()) ||
        (period === "month" && sameMonth) ||
        (period === "today" && sameMonth && created.getDate() === now.getDate());
      return matchesStatus && matchesText && matchesPeriod && (!onlyCritical || r.criticalCount > 0);
    });
  }, [q, reports, status, period, onlyCritical]);

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
              placeholder="بحث بالاسم أو الهاتف أو الكود أو العينة"
              className="ps-9"
            />
          </div>
          <label className="relative block">
            <SlidersHorizontal className="pointer-events-none absolute top-3.5 start-3 size-4 text-muted" />
            <select value={status} onChange={(e) => setStatus(e.target.value as typeof status)} className="h-11 w-full appearance-none rounded-lg border border-line bg-elevated ps-9 pe-8 text-sm outline-none focus:border-teal sm:w-48">
              <option value="all">كل الحالات</option>
              <option value="draft">مسودة ({statusCounts.draft})</option>
              <option value="pending_review">في انتظار المراجعة ({statusCounts.pending_review})</option>
              <option value="approved">معتمد ({statusCounts.approved})</option>
              <option value="cancelled">ملغي ({statusCounts.cancelled})</option>
            </select>
          </label>
        </div>
      </header>

      <div className="mb-4 flex flex-wrap gap-2">
        <PeriodChip active={period === "today"} onClick={() => setPeriod(period === "today" ? "all" : "today")}>اليوم</PeriodChip>
        <PeriodChip active={period === "month"} onClick={() => setPeriod(period === "month" ? "all" : "month")}>هذا الشهر</PeriodChip>
        <PeriodChip active={period === "year"} onClick={() => setPeriod(period === "year" ? "all" : "year")}>هذا العام</PeriodChip>
        <PeriodChip active={period === "all"} onClick={() => setPeriod("all")}>الكل</PeriodChip>
        {criticalTotal > 0 ? (
          <PeriodChip active={onlyCritical} onClick={() => setOnlyCritical(!onlyCritical)}>بقيم حرجة ({criticalTotal})</PeriodChip>
        ) : null}
        {statusCounts.pending_review > 0 && status !== "pending_review" ? (
          <PeriodChip active={false} onClick={() => setStatus("pending_review")}>بانتظار المراجعة ({statusCounts.pending_review})</PeriodChip>
        ) : null}
      </div>

      <div className="mb-3 flex items-center justify-between text-xs text-muted">
        <span>عرض {filtered.length} من {reports.length} تقرير</span>
        {(q || status !== "all" || period !== "all" || onlyCritical) ? <button type="button" onClick={() => { setQ(""); setStatus("all"); setPeriod("all"); setOnlyCritical(false); }} className="font-medium text-teal hover:underline">مسح الفلاتر</button> : null}
      </div>

      {deleteError ? <p role="alert" className="mb-3 rounded-lg border border-high/20 bg-high-bg px-3 py-2 text-sm text-high">{deleteError}</p> : null}

      {reports.length === 0 ? (
        <div className="rounded-lg border border-dashed border-line px-4 py-12 text-center text-sm text-muted">
          <p>لا توجد تقارير بعد.</p>
          <Link to="/new" className="mt-3 inline-flex h-11 items-center rounded-sm bg-teal px-4 font-medium text-teal-fg">إنشاء أول تقرير</Link>
        </div>
      ) : filtered.length === 0 ? (
        <p className="rounded-lg border border-dashed border-line px-4 py-12 text-center text-sm text-muted">
          لا توجد تقارير مطابقة.
        </p>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-elevated">
          {filtered.map((r) => {
            const bad = r.flaggedCount;
            const critical = r.criticalCount;
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
                      {formatAge("ar", r.age, r.ageUnit)} · {r.gender} · {r.doctor} · {formatListDate(r.createdAt)}
                    </p>
                    <span className={`mt-1.5 inline-flex rounded-full px-2 py-0.5 text-[11px] sm:hidden ${reportStatusClasses[r.status]}`}>{reportStatusLabels[r.status]}</span>
                  </div>
                  <span className={`hidden rounded-full px-2 py-1 text-[11px] sm:inline ${reportStatusClasses[r.status]}`}>{reportStatusLabels[r.status]}</span>
                  <span className="hidden text-xs text-muted sm:inline">{r.testCount} تحليل</span>
                  {critical > 0 ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-high-bg px-2 py-1 text-xs font-medium text-high">
                      <TriangleAlert className="size-3.5" />
                      {critical} حرج
                    </span>
                  ) : null}
                  <span className="inline-flex items-center gap-1.5 text-xs">
                    <FlagDot flag={bad ? "high" : "normal"} />
                    {bad ? `${bad} علامة` : "طبيعي"}
                  </span>
                </Link>
                {canDelete && (r.status !== "approved" || isOwner) ? (
                  <button
                    type="button"
                    onClick={() => removeReport(r)}
                    disabled={deletingId === r.id}
                    aria-label={`حذف تقرير ${r.patientName}`}
                    className="grid w-12 shrink-0 place-items-center border-s border-line text-muted transition-colors hover:bg-high-bg hover:text-high focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                  >
                    {deletingId === r.id ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
                  </button>
                ) : null}
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
