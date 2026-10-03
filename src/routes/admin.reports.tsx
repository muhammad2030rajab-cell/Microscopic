import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { BarChart3, FileText, ArrowRight, CheckCircle2, Clock3, XCircle } from "lucide-react";
import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { isPlatformAdmin } from "@/lib/platform-admin";
import { SimpleBarChart, SimpleLineChart, SimplePieChart } from "@/components/charts/simple-charts";

const getAdminReportStats = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    const admin = await sql<{ id: string }>`select auth_user_id as id from platform_admins where auth_user_id=${context.userId} limit 1`;
    if (!admin.length) throw new Error("FORBIDDEN");
    const totals = await sql<{ total: number; draft: number; pending: number; approved: number; cancelled: number }>`
      select count(*)::int as total,
             count(*) filter (where status='draft')::int as draft,
             count(*) filter (where status='pending_review')::int as pending,
             count(*) filter (where status='approved')::int as approved,
             count(*) filter (where status='cancelled')::int as cancelled
      from reports
    `;
    const labs = await sql<{ id: string; name: string; reports: number; approved: number; pending: number }>`
      select l.id, l.name,
             count(r.id)::int as reports,
             count(r.id) filter (where r.status='approved')::int as approved,
             count(r.id) filter (where r.status='pending_review')::int as pending
      from labs l
      left join reports r on r.lab_id=l.id
      group by l.id, l.name
      order by count(r.id) desc, l.name asc
    `;
    const daily = await sql<{ day: string; count: number }>`
      select to_char(d.day, 'YYYY-MM-DD') as day, coalesce(count(r.id), 0)::int as count
      from generate_series(current_date - interval '13 days', current_date, interval '1 day') as d(day)
      left join reports r on r.created_at::date = d.day
      group by d.day
      order by d.day asc
    `;
    return { totals: totals[0] ?? { total: 0, draft: 0, pending: 0, approved: 0, cancelled: 0 }, labs, daily };
  });

const EMPTY_STATS = {
  totals: { total: 0, draft: 0, pending: 0, approved: 0, cancelled: 0 },
  labs: [] as { id: string; name: string; reports: number; approved: number; pending: number }[],
  daily: [] as { day: string; count: number }[],
};

export const Route = createFileRoute("/admin/reports")({
  loader: async () => {
    try {
      const [isAdmin, stats] = await Promise.all([isPlatformAdmin(), getAdminReportStats()]);
      return { isAdmin, stats };
    } catch {
      return { isAdmin: false, stats: EMPTY_STATS };
    }
  },
  component: AdminReports,
});

function formatDayLabel(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("ar-EG", { day: "numeric", month: "numeric" });
}

function AdminReports() {
  const { isAdmin, stats } = Route.useLoaderData();
  if (!isAdmin) return <Navigate to="/login" />;
  const t = stats.totals;
  const dailyChartData = stats.daily.map((d) => ({ label: formatDayLabel(d.day), value: d.count }));
  const statusPieData = [
    { label: "مسودة", value: t.draft, color: "#94a3b8" },
    { label: "في المراجعة", value: t.pending, color: "#f59e0b" },
    { label: "معتمد", value: t.approved, color: "#14b8a6" },
    { label: "ملغي", value: t.cancelled, color: "#ef4444" },
  ];
  return (
    <main className="min-h-screen bg-paper">
      <header className="border-b border-line bg-elevated">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
          <div><p className="text-[11px] uppercase tracking-[0.2em] text-muted">Central administration</p><h1 className="mt-1 font-display text-xl font-semibold">تقارير الشبكة 📊</h1></div>
          <Link to="/admin" className="inline-flex items-center gap-2 text-sm text-teal hover:underline"><ArrowRight className="size-4" /> لوحة التحكم</Link>
        </div>
      </header>
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        <section className="rounded-2xl bg-ink p-6 text-paper sm:p-8">
          <p className="text-sm text-paper/60">Network overview</p>
          <h2 className="mt-2 font-display text-3xl font-semibold">متابعة التقارير لكل المعامل</h2>
          <p className="mt-3 text-sm leading-7 text-paper/65">لوحة مركزية للمدير لمتابعة حجم التقارير وحالتها بدون كشف بيانات المرضى بين المعامل.</p>
        </section>
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <Stat title="إجمالي التقارير" value={t.total} icon={<FileText />} />
          <Stat title="مسودة" value={t.draft} icon={<Clock3 />} />
          <Stat title="مراجعة" value={t.pending} icon={<Clock3 />} />
          <Stat title="معتمد" value={t.approved} icon={<CheckCircle2 />} />
          <Stat title="ملغي" value={t.cancelled} icon={<XCircle />} />
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-[1.4fr_1fr]">
          <section className="rounded-xl border border-line bg-elevated p-5 sm:p-6">
            <h3 className="font-display text-lg font-semibold">التقارير خلال آخر 14 يوم</h3>
            <p className="mt-1 text-xs text-muted">عدد التقارير المُنشأة يوميًا عبر كل المعامل.</p>
            <div className="mt-4">
              {t.total === 0 ? <p className="py-10 text-center text-sm text-muted">لا توجد بيانات كافية بعد.</p> : <SimpleLineChart data={dailyChartData} height={200} />}
            </div>
          </section>
          <section className="rounded-xl border border-line bg-elevated p-5 sm:p-6">
            <h3 className="font-display text-lg font-semibold">توزيع حالات التقارير</h3>
            <p className="mt-1 text-xs text-muted">نسبة كل حالة من إجمالي التقارير.</p>
            <div className="mt-4 flex justify-center">
              <SimplePieChart data={statusPieData} />
            </div>
          </section>
        </div>

        <section className="mt-6 overflow-hidden rounded-xl border border-line bg-elevated">
          <div className="border-b border-line p-5"><h3 className="font-display text-xl font-semibold">التقارير حسب المعمل</h3></div>
          {stats.labs.length > 0 ? (
            <div className="border-b border-line p-5">
              <SimpleBarChart height={160} data={stats.labs.slice(0, 8).map((lab) => ({ label: lab.name, value: lab.reports }))} />
            </div>
          ) : null}
          <div className="divide-y divide-line">
            {stats.labs.length === 0 ? <p className="p-8 text-center text-sm text-muted">لا توجد معامل بعد.</p> : stats.labs.map((lab) => (
              <div key={lab.id} className="flex items-center gap-4 p-4 sm:p-5">
                <div className="grid size-10 shrink-0 place-items-center rounded-lg bg-teal/10 text-teal"><BarChart3 className="size-5" /></div>
                <div className="min-w-0 flex-1"><p className="font-medium">{lab.name}</p><p className="mt-1 text-xs text-muted">{lab.reports} تقرير · {lab.approved} معتمد · {lab.pending} في المراجعة</p></div>
                <div className="text-xl font-semibold tabular-nums">{lab.reports}</div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}

function Stat({ title, value, icon }: { title: string; value: number; icon: ReactNode }) {
  return <div className="rounded-xl border border-line bg-elevated p-4"><div className="grid size-9 place-items-center rounded-lg bg-teal/10 text-teal">{icon}</div><p className="mt-3 text-xs text-muted">{title}</p><p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p></div>;
}
