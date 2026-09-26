import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { ArrowRight, Database, LockKeyhole, Settings2 } from "lucide-react";
import { isPlatformAdmin } from "@/lib/platform-admin";

export const Route = createFileRoute("/admin/settings")({
  loader: async () => {
    try {
      return { isAdmin: await isPlatformAdmin() };
    } catch {
      return { isAdmin: false };
    }
  },
  component: AdminSettings,
});

function AdminSettings() {
  const { isAdmin } = Route.useLoaderData();
  if (!isAdmin) return <Navigate to="/login" />;
  return <main className="min-h-screen bg-paper"><header className="border-b border-line bg-elevated"><div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6"><div><p className="text-[11px] uppercase tracking-[0.2em] text-muted">Central administration</p><h1 className="mt-1 font-display text-xl font-semibold">إعدادات النظام ⚙️</h1></div><Link to="/admin" className="inline-flex items-center gap-2 text-sm text-teal hover:underline"><ArrowRight className="size-4" /> لوحة التحكم</Link></div></header><div className="mx-auto max-w-4xl px-4 py-6 sm:px-6"><section className="rounded-2xl bg-ink p-6 text-paper sm:p-8"><p className="text-sm text-paper/60">Rajab Diagnostics</p><h2 className="mt-2 font-display text-3xl font-semibold">إعدادات الشبكة المركزية</h2><p className="mt-3 text-sm leading-7 text-paper/65">المكان المخصص لإعدادات المنصة العامة. البيانات الحساسة لا تظهر هنا ولا يتم حفظ كلمات المرور داخل جداول المعامل.</p></section><div className="mt-6 grid gap-4 sm:grid-cols-3"><InfoCard icon={<Database />} title="قاعدة البيانات" text="Neon + PostgreSQL" /><InfoCard icon={<LockKeyhole />} title="الحماية" text="حسابات وصلاحيات معزولة" /><InfoCard icon={<Settings2 />} title="المنصة" text="Multi-Lab V1" /></div><div className="mt-6 rounded-xl border border-dashed border-line bg-elevated p-5 text-sm leading-7 text-muted">💡 الإعدادات القابلة للتعديل هنضيفها هنا تدريجيًا، بدل إضافة مفاتيح شكلية لا تؤثر على النظام.</div></div></main>;
}
function InfoCard({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) { return <div className="rounded-xl border border-line bg-elevated p-5"><div className="grid size-10 place-items-center rounded-lg bg-teal/10 text-teal">{icon}</div><h3 className="mt-4 font-semibold">{title}</h3><p className="mt-1 text-sm text-muted">{text}</p></div>; }
