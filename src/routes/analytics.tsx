import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { ArrowRight, Users, FileText, AlertTriangle, FlaskConical } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { getCurrentLab, type LabProfileData } from "@/lib/lab-access";
import { getLabAnalytics, type LabAnalytics } from "@/lib/analytics";
import { FEATURE_DISABLED_MESSAGE } from "@/lib/lab-features";
import { reportStatusLabels } from "@/lib/report-workflow";
import { SimpleBarChart, SimpleLineChart, SimplePieChart } from "@/components/charts/simple-charts";

const EMPTY: LabAnalytics = { daily: [], statusBreakdown: [], topTests: [], criticalCount: 0, totalPatients: 0, totalReports: 0 };

export const Route = createFileRoute("/analytics")({
  loader: async () => {
    try {
      const lab = await getCurrentLab();
      try {
        return { lab, analytics: await getLabAnalytics(), disabled: false };
      } catch (err) {
        // Feature switched off by the platform admin: stay signed in and say so.
        if (err instanceof Error && err.message === FEATURE_DISABLED_MESSAGE) {
          return { lab, analytics: EMPTY, disabled: true };
        }
        throw err;
      }
    } catch {
      return { lab: null as LabProfileData | null, analytics: EMPTY, disabled: false };
    }
  },
  component: AnalyticsPage,
});

function formatDayLabel(iso: string) {
  return new Date(iso).toLocaleDateString("ar-EG", { day: "numeric", month: "numeric" });
}

const STATUS_COLORS: Record<string, string> = {
  draft: "#94a3b8",
  pending_review: "#f59e0b",
  approved: "#14b8a6",
  cancelled: "#ef4444",
};

function AnalyticsPage() {
  const { lab, analytics, disabled } = Route.useLoaderData();
  if (!lab) return <Navigate to="/login" replace />;
  if (disabled) {
    return (
      <AppShell>
        <div className="rounded-xl border border-dashed border-line bg-elevated p-6 text-sm leading-7 text-muted">
          {FEATURE_DISABLED_MESSAGE}
          <div className="mt-3"><Link to="/lab" className="text-teal hover:underline">رجوع للوحة المعمل</Link></div>
        </div>
      </AppShell>
    );
  }

  const dailyChartData = analytics.daily.map((d) => ({ label: formatDayLabel(d.day), value: d.count }));
  const statusPieData = analytics.statusBreakdown.map((s) => ({
    label: reportStatusLabels[s.status as keyof typeof reportStatusLabels] ?? s.status,
    value: s.count,
    color: STATUS_COLORS[s.status] ?? "#94a3b8",
  }));
  const topTestsData = analytics.topTests.map((t) => ({ label: t.name, value: t.count }));

  return (
    <AppShell>
      <header className="mb-5 flex items-center justify-between">
        <div><p className="text-xs uppercase tracking-[0.18em] text-muted">Lab Analytics</p><h1 className="mt-1 font-display text-2xl font-semibold sm:text-3xl">الإحصائيات 📊</h1></div>
        <Link to="/lab" className="inline-flex items-center gap-2 text-sm text-teal hover:underline"><ArrowRight className="size-4" /> لوحة المعمل</Link>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="إجمالي التقارير" value={analytics.totalReports} icon={<FileText />} />
        <StatCard label="إجمالي المرضى" value={analytics.totalPatients} icon={<Users />} />
        <StatCard label="نتائج حرجة" value={analytics.criticalCount} icon={<AlertTriangle />} tone={analytics.criticalCount > 0 ? "danger" : undefined} />
        <StatCard label="أكثر تحليل طلبًا" value={analytics.topTests[0]?.name ?? "—"} icon={<FlaskConical />} isText />
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <section className="rounded-xl border border-line bg-elevated p-5 sm:p-6">
          <h3 className="font-display text-lg font-semibold">التقارير خلال آخر 14 يوم</h3>
          <p className="mt-1 text-xs text-muted">عدد التقارير المُنشأة يوميًا في معملك.</p>
          <div className="mt-4">
            {analytics.totalReports === 0 ? <p className="py-10 text-center text-sm text-muted">لا توجد بيانات كافية بعد.</p> : <SimpleLineChart data={dailyChartData} height={200} />}
          </div>
        </section>
        <section className="rounded-xl border border-line bg-elevated p-5 sm:p-6">
          <h3 className="font-display text-lg font-semibold">توزيع حالات التقارير</h3>
          <p className="mt-1 text-xs text-muted">نسبة كل حالة من إجمالي تقاريرك.</p>
          <div className="mt-4 flex justify-center">
            {analytics.totalReports === 0 ? <p className="py-10 text-center text-sm text-muted">لا توجد بيانات بعد.</p> : <SimplePieChart data={statusPieData} />}
          </div>
        </section>
      </div>

      <section className="mt-4 rounded-xl border border-line bg-elevated p-5 sm:p-6">
        <h3 className="font-display text-lg font-semibold">أكثر التحاليل طلبًا</h3>
        <p className="mt-1 text-xs text-muted">التحاليل الأكثر تكرارًا في تقارير معملك.</p>
        <div className="mt-4">
          {topTestsData.length === 0 ? <p className="py-10 text-center text-sm text-muted">لا توجد بيانات كافية بعد.</p> : <SimpleBarChart height={180} data={topTestsData} />}
        </div>
      </section>
    </AppShell>
  );
}

function StatCard({ label, value, icon, tone, isText }: { label: string; value: number | string; icon: ReactNode; tone?: "danger"; isText?: boolean }) {
  return (
    <div className="rounded-xl border border-line bg-elevated p-4">
      <div className={`grid size-9 place-items-center rounded-lg ${tone === "danger" ? "bg-high/10 text-high" : "bg-teal/10 text-teal"}`}>{icon}</div>
      <p className="mt-3 text-xs text-muted">{label}</p>
      <p className={`mt-1 font-semibold tabular-nums ${isText ? "truncate text-base" : "text-2xl"}`}>{value}</p>
    </div>
  );
}
