import { useEffect, useState, type ReactNode } from "react";
import { createFileRoute, Link, Navigate, Outlet, useRouterState } from "@tanstack/react-router";
import { Building2, ChevronLeft, FileText, Plus, Settings2, ShieldCheck, Users } from "lucide-react";
import { UserButton } from "@/lib/auth/gates";
import { isPlatformAdmin, getCurrentPlatformPermissions, getAdminOverview, type AdminOverview } from "@/lib/platform-admin";

export const Route = createFileRoute("/admin")({
  loader: async ({ location }) => {
    // Keep first-admin bootstrap accessible before any platform admin exists.
    if (location.pathname === "/admin/setup") return { isAdmin: false, canManageAdmins: false };
    try {
      const isAdmin = await isPlatformAdmin();
      if (!isAdmin) return { isAdmin: false, canManageAdmins: false };
      const access = await getCurrentPlatformPermissions();
      return { isAdmin, canManageAdmins: access.isSuper || access.permissions["admins.manage"] === true };
    } catch {
      return { isAdmin: false, canManageAdmins: false };
    }
  },
  component: AdminRoute,
});

function AdminRoute() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  if (pathname === "/admin") return <AdminDashboard />;
  return <Outlet />;
}

function AdminDashboard() {
  const { isAdmin, canManageAdmins } = Route.useLoaderData();
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [overviewFailed, setOverviewFailed] = useState(false);

  useEffect(() => {
    if (!isAdmin) return;
    let cancelled = false;
    getAdminOverview()
      .then((data) => { if (!cancelled) setOverview(data); })
      .catch(() => { if (!cancelled) setOverviewFailed(true); });
    return () => { cancelled = true; };
  }, [isAdmin]);

  if (!isAdmin) return <Navigate to="/login" />;

  const noLabsYet = overview !== null && overview.labs.total === 0;

  return (
    <main className="min-h-dvh bg-paper">
      <header className="border-b border-line bg-elevated">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <div>
            <p className="text-xs text-muted">Rajab Diagnostics</p>
            <h1 className="font-display text-xl font-semibold">لوحة تحكم المدير</h1>
          </div>
          <UserButton />
        </div>
      </header>

      <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-display text-2xl font-semibold sm:text-3xl">إدارة شبكة المعامل</h2>
            <p className="mt-1 text-sm text-muted">كل معمل يشوف بياناته فقط.</p>
          </div>
          <Link
            to="/admin/labs"
            className="inline-flex h-11 items-center gap-2 rounded-sm bg-teal px-4 text-sm font-medium text-teal-fg transition-colors hover:bg-teal-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-paper"
          >
            <Plus className="size-4" />
            إنشاء حساب معمل
          </Link>
        </div>

        {/* أرقام الشبكة */}
        <section aria-label="ملخص الشبكة" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat
            label="المعامل النشطة"
            value={overview ? overview.labs.active : null}
            hint={overview ? `من ${overview.labs.total}` : undefined}
            to="/admin/labs"
          />
          <Stat
            label="المستخدمون النشطون"
            value={overview ? overview.users : null}
            to="/admin/users"
          />
          <Stat
            label="تقارير اليوم"
            value={overview ? overview.reports.today : null}
            hint={overview ? `الإجمالي ${overview.reports.total}` : undefined}
            to="/admin/reports"
          />
          <Stat
            label="بانتظار المراجعة"
            value={overview ? overview.reports.pending : null}
            to="/admin/reports"
            attention={overview ? overview.reports.pending > 0 : false}
          />
        </section>

        {overviewFailed ? (
          <p className="rounded-md border border-line bg-elevated px-3 py-2 text-sm text-muted">
            تعذر تحميل الأرقام الآن. باقي أقسام اللوحة تعمل بشكل طبيعي.
          </p>
        ) : null}

        {noLabsYet ? (
          <section className="rounded-lg border border-dashed border-line-strong bg-elevated p-6">
            <h3 className="font-display text-lg font-semibold">لا يوجد أي معمل بعد</h3>
            <p className="mt-1 text-sm text-muted">أضف أول معمل بإنشاء اسم مستخدم وكلمة مرور له، ثم يكمل المعمل بياناته بنفسه.</p>
            <Link to="/admin/labs" className="mt-4 inline-flex text-sm font-medium text-teal hover:underline">إضافة أول معمل</Link>
          </section>
        ) : null}

        {/* الأقسام */}
        <section aria-label="الأقسام" className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <NavCard to="/admin/labs" icon={<Building2 />} title="المعامل" description="إضافة وإيقاف وحذف" />
          <NavCard to="/admin/users" icon={<Users />} title="المستخدمون" description="الحسابات والصلاحيات" />
          <NavCard to="/admin/reports" icon={<FileText />} title="التقارير" description="إحصائيات الشبكة" />
          {canManageAdmins ? <NavCard to="/admin/team" icon={<ShieldCheck />} title="فريق الإدارة" description="مديرو المنصة" /> : null}
          <NavCard to="/admin/settings" icon={<Settings2 />} title="الإعدادات" description="إعدادات النظام" />
        </section>

        {/* آخر المعامل */}
        {overview && overview.recentLabs.length > 0 ? (
          <section aria-label="آخر المعامل">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="font-display text-lg font-semibold">آخر المعامل المضافة</h3>
              <Link to="/admin/labs" className="text-sm text-teal hover:underline">عرض الكل</Link>
            </div>
            <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-elevated">
              {overview.recentLabs.map((lab) => (
                <li key={lab.id}>
                  <Link to="/admin/labs" className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-paper-2/60">
                    <span
                      className={`size-2 shrink-0 rounded-full ${lab.isActive ? "bg-ok" : "bg-line-strong"}`}
                      aria-hidden="true"
                    />
                    <span className="min-w-0 flex-1 truncate font-medium">{lab.name}</span>
                    <span className="text-xs text-muted">{lab.isActive ? "نشط" : "موقوف"}</span>
                    <span className="text-xs text-muted">{lab.reports} تقرير</span>
                    <ChevronLeft className="size-4 shrink-0 text-muted" aria-hidden="true" />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </main>
  );
}

function Stat({ label, value, hint, to, attention = false }: { label: string; value: number | null; hint?: string; to: "/admin/labs" | "/admin/users" | "/admin/reports"; attention?: boolean }) {
  return (
    <Link
      to={to}
      className={`rounded-lg border p-4 transition-colors hover:border-teal/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
        attention ? "border-low/30 bg-low-bg" : "border-line bg-elevated"
      }`}
    >
      <p className="text-xs text-muted">{label}</p>
      {value === null ? (
        <span className="mt-2 block h-8 w-12 animate-pulse rounded-sm bg-paper-2" aria-label="جارٍ التحميل" />
      ) : (
        <p className={`mt-1 font-display text-3xl font-semibold tabular-nums ${attention ? "text-low" : ""}`}>{value}</p>
      )}
      {hint ? <p className="mt-0.5 text-xs text-muted">{hint}</p> : null}
    </Link>
  );
}

function NavCard({ to, icon, title, description }: { to: "/admin/labs" | "/admin/users" | "/admin/reports" | "/admin/team" | "/admin/settings"; icon: ReactNode; title: string; description: string }) {
  return (
    <Link
      to={to}
      className="flex items-center gap-3 rounded-lg border border-line bg-elevated p-3.5 transition-colors hover:border-teal/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:p-4"
    >
      <span className="grid size-10 shrink-0 place-items-center rounded-md bg-teal/10 text-teal [&_svg]:size-5">{icon}</span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold">{title}</span>
        <span className="block truncate text-xs text-muted">{description}</span>
      </span>
    </Link>
  );
}
