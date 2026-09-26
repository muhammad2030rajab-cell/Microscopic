import { type ReactNode } from "react";
import { createFileRoute, Link, Navigate, Outlet, useRouterState } from "@tanstack/react-router";
import { Building2, FileText, Settings2, ShieldCheck, Users } from "lucide-react";
import { UserButton } from "@/lib/auth/gates";
import { isPlatformAdmin, getCurrentPlatformPermissions } from "@/lib/platform-admin";

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

  if (!isAdmin) return <Navigate to="/login" />;

  return (
    <main className="min-h-screen bg-paper">
      <header className="border-b border-line bg-elevated">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <div><p className="text-[11px] uppercase tracking-[0.2em] text-muted">Central administration</p><h1 className="mt-1 font-display text-xl font-semibold">لوحة تحكم المدير 👑</h1></div>
          <UserButton />
        </div>
      </header>
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        <section className="rounded-2xl bg-ink p-6 text-paper sm:p-8">
          <p className="text-sm text-paper/60">Rajab Diagnostics</p>
          <h2 className="mt-2 font-display text-3xl font-semibold">إدارة شبكة المعامل الطبية</h2>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-paper/65">من هنا هنضيف المعامل، ننشئ حسابات المستخدمين، ونتحكم في التقارير والصلاحيات — وكل معمل هيشوف بياناته فقط.</p>
        </section>
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <Link to="/admin/labs" className="group"><AdminCard icon={<Building2 />} title="المعامل" description="إضافة وإيقاف وحذف المعامل" /></Link>
          <Link to="/admin/users" className="group"><AdminCard icon={<Users />} title="المستخدمون" description="حسابات وصلاحيات كل معمل" /></Link>
          <Link to="/admin/reports" className="group"><AdminCard icon={<FileText />} title="التقارير" description="إحصائيات ومتابعة تقارير الشبكة" /></Link>
          {canManageAdmins ? <Link to="/admin/team" className="group"><AdminCard icon={<ShieldCheck />} title="فريق الإدارة" description="إضافة وإيقاف مديري المنصة" /></Link> : null}
          <Link to="/admin/settings" className="group"><AdminCard icon={<Settings2 />} title="الإعدادات" description="إعدادات النظام المركزية" /></Link>
        </div>
        <section className="mt-8 grid gap-4 sm:grid-cols-3">
          <Link to="/admin/labs" className="rounded-xl border border-line bg-elevated p-5 transition hover:-translate-y-0.5 hover:border-teal/40 hover:shadow-sm"><p className="text-xs text-muted">إجراء سريع</p><h3 className="mt-1 font-semibold">➕ إنشاء حساب معمل</h3><p className="mt-1 text-sm text-muted">اسم مستخدم وكلمة مرور ثم يكمل المعمل بياناته.</p></Link>
          <Link to="/admin/reports" className="rounded-xl border border-line bg-elevated p-5 transition hover:-translate-y-0.5 hover:border-teal/40 hover:shadow-sm"><p className="text-xs text-muted">مراقبة</p><h3 className="mt-1 font-semibold">📊 متابعة أداء الشبكة</h3><p className="mt-1 text-sm text-muted">إجمالي التقارير وحالاتها لكل معمل.</p></Link>
          <Link to="/admin/users" className="rounded-xl border border-line bg-elevated p-5 transition hover:-translate-y-0.5 hover:border-teal/40 hover:shadow-sm"><p className="text-xs text-muted">صلاحيات</p><h3 className="mt-1 font-semibold">🛡️ مراجعة المستخدمين</h3><p className="mt-1 text-sm text-muted">الأدوار وحالة الحسابات في كل معمل.</p></Link>
        </section>
        <section className="mt-8 rounded-xl border border-dashed border-line bg-elevated p-6">
          <h3 className="font-display text-lg font-semibold">حالة النسخة</h3>
          <p className="mt-2 text-sm leading-6 text-muted">النسخة الحالية Multi-Lab V1: عزل بيانات المعامل، حساب مدير مركزي، إنشاء حسابات المعامل، إعداد ملف المعمل، وتقارير وإحصائيات مركزية.</p>
          <Link to="/admin/labs" className="mt-4 inline-flex text-sm text-teal hover:underline">ابدأ بإضافة أول معمل ←</Link>
        </section>
      </div>
    </main>
  );
}

function AdminCard({ icon, title, description }: { icon: ReactNode; title: string; description: string }) {
  return <div className="h-full rounded-xl border border-line bg-elevated p-5 transition group-hover:-translate-y-0.5 group-hover:border-teal/40 group-hover:shadow-sm"><div className="grid size-10 place-items-center rounded-lg bg-teal/10 text-teal">{icon}</div><h3 className="mt-4 font-semibold">{title}</h3><p className="mt-1 text-sm text-muted">{description}</p></div>;
}
