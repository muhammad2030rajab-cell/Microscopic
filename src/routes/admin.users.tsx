import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { ArrowRight, ShieldCheck, UserRound } from "lucide-react";
import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { isPlatformAdmin } from "@/lib/platform-admin";

const listAdminUsers = createServerFn({ method: "GET" }).middleware([authMiddleware]).handler(async ({ context }) => {
  const sql = await getSql();
  const admin = await sql`select 1 from platform_admins where auth_user_id=${context.userId} limit 1`;
  if (!admin.length) throw new Error("FORBIDDEN");
  return sql<{ username: string; role: string; lab_name: string; is_active: boolean }>`
    select lu.username, lu.role, l.name as lab_name, lu.is_active
    from lab_users lu join labs l on l.id=lu.lab_id
    order by l.name, lu.role, lu.username
  `;
});

export const Route = createFileRoute("/admin/users")({
  loader: async () => {
    try {
      const [isAdmin, users] = await Promise.all([isPlatformAdmin(), listAdminUsers()]);
      return { isAdmin, users };
    } catch {
      return { isAdmin: false, users: [] as { username: string; role: string; lab_name: string; is_active: boolean }[] };
    }
  },
  component: AdminUsers,
});

function AdminUsers() {
  const { isAdmin, users } = Route.useLoaderData();
  if (!isAdmin) return <Navigate to="/login" />;
  return <main className="min-h-screen bg-paper"><header className="border-b border-line bg-elevated"><div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6"><div><p className="text-[11px] uppercase tracking-[0.2em] text-muted">Central administration</p><h1 className="mt-1 font-display text-xl font-semibold">المستخدمون والصلاحيات 👥</h1></div><Link to="/admin" className="inline-flex items-center gap-2 text-sm text-teal hover:underline"><ArrowRight className="size-4" /> لوحة التحكم</Link></div></header><div className="mx-auto max-w-6xl px-4 py-6 sm:px-6"><section className="rounded-xl border border-line bg-elevated p-5 sm:p-6"><div className="flex items-center gap-3"><div className="grid size-10 place-items-center rounded-lg bg-teal/10 text-teal"><ShieldCheck className="size-5" /></div><div><h2 className="font-display text-2xl font-semibold">حسابات المعامل</h2><p className="mt-1 text-sm text-muted">عرض المستخدمين والأدوار وحالة الحسابات.</p></div></div><div className="mt-6 overflow-hidden rounded-lg border border-line"><div className="divide-y divide-line">{users.length === 0 ? <p className="p-8 text-center text-sm text-muted">لا توجد حسابات معامل.</p> : users.map((u) => <div key={`${u.lab_name}:${u.username}`} className="flex items-center gap-3 p-4"><div className="grid size-9 shrink-0 place-items-center rounded-lg bg-paper-2 text-teal"><UserRound className="size-4" /></div><div className="min-w-0 flex-1"><p className="font-medium">{u.username}</p><p className="text-xs text-muted">{u.lab_name} · {u.role}</p></div><span className={`rounded-full px-2 py-1 text-[11px] ${u.is_active ? "bg-ok/10 text-ok" : "bg-high/10 text-high"}`}>{u.is_active ? "نشط" : "موقوف"}</span></div>)}</div></div></section></div></main>;
}
