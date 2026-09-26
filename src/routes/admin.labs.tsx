import { useEffect, useState, type FormEvent } from "react";
import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { ArrowRight, Building2, CheckCircle2, Pause, Play, Plus, ShieldCheck, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  isPlatformAdmin, createLab, listAdminLabs, toggleLabActive, deleteLab,
  getCurrentPlatformPermissions, type AdminLab, type PlatformPermissions,
} from "@/lib/platform-admin";

export const Route = createFileRoute("/admin/labs")({
  loader: async () => {
    try {
      const [isAdmin, labs, access] = await Promise.all([isPlatformAdmin(), listAdminLabs(), getCurrentPlatformPermissions()]);
      return { isAdmin, labs, isSuper: access.isSuper, permissions: access.permissions };
    } catch {
      return { isAdmin: false, labs: [] as AdminLab[], isSuper: false, permissions: {} as PlatformPermissions };
    }
  },
  component: AdminLabs,
});

function AdminLabs() {
  const { isAdmin, labs: initialLabs, isSuper, permissions } = Route.useLoaderData();
  const [labs, setLabs] = useState<AdminLab[]>(initialLabs);
  const [showForm, setShowForm] = useState(initialLabs.length === 0);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => setLabs(initialLabs), [initialLabs]);

  if (!isAdmin) return <Navigate to="/login" />;
  const canCreate = isSuper || permissions["labs.create"] === true;
  const canSuspend = isSuper || permissions["labs.suspend"] === true;
  const canDelete = isSuper || permissions["labs.delete"] === true;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSuccess("");
    setLoading(true);
    try {
      const result = await createLab({ data: { username, password } });
      setLabs((current) => [{
        id: result.id,
        name: result.name,
        nameEn: null,
        username: result.username,
        phone: null,
        address: null,
        doctorName: null,
        isActive: true,
        createdAt: new Date().toISOString(),
      }, ...current]);
      setSuccess(`تم إنشاء حساب المعمل بنجاح — اسم المستخدم: ${result.username}. عند أول دخول سيكمل المعمل بياناته.`);
      setUsername(""); setPassword("");
      setShowForm(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذر إنشاء المعمل");
    } finally {
      setLoading(false);
    }
  }

  async function toggleActive(lab: AdminLab) {
    setError(""); setBusyId(lab.id);
    try {
      await toggleLabActive({ data: { labId: lab.id, isActive: !lab.isActive } });
      setLabs((current) => current.map((l) => l.id === lab.id ? { ...l, isActive: !l.isActive } : l));
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذر تعديل حالة المعمل");
    } finally {
      setBusyId(null);
    }
  }

  async function remove(lab: AdminLab) {
    if (!window.confirm(`هل أنت متأكد من حذف "${lab.name}" نهائيًا؟ سيتم حذف كل بيانات المرضى والتقارير المرتبطة به. لا يمكن التراجع عن هذا الإجراء.`)) return;
    setError(""); setBusyId(lab.id);
    try {
      await deleteLab({ data: { labId: lab.id } });
      setLabs((current) => current.filter((l) => l.id !== lab.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذر حذف المعمل");
      setBusyId(null);
    }
  }

  return (
    <main className="min-h-screen bg-paper">
      <header className="border-b border-line bg-elevated">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <div>
            <p className="text-[11px] uppercase tracking-[0.2em] text-muted">Central administration</p>
            <h1 className="mt-1 font-display text-xl font-semibold">إدارة المعامل 🏥</h1>
          </div>
          <Link to="/admin" className="inline-flex items-center gap-2 text-sm text-teal hover:underline"><ArrowRight className="size-4" /> لوحة التحكم</Link>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        <section className="rounded-2xl bg-ink p-6 text-paper sm:p-8">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm text-paper/60">Laboratory network</p>
              <h2 className="mt-2 font-display text-3xl font-semibold">إنشاء حساب معمل جديد</h2>
              <p className="mt-3 max-w-2xl text-sm leading-7 text-paper/65">أنت تنشئ بيانات الدخول فقط. عند أول تسجيل دخول، المعمل نفسه يكمل الاسم والعنوان والتواصل والبيانات التي ستظهر على التقارير.</p>
            </div>
            <div className="hidden size-12 place-items-center rounded-xl bg-teal/15 text-teal sm:grid"><Building2 className="size-6" /></div>
          </div>
        </section>

        {success ? <div className="mt-5 flex items-start gap-3 rounded-xl border border-ok/20 bg-ok/5 p-4 text-sm"><CheckCircle2 className="mt-0.5 size-5 shrink-0 text-ok" /><div><p className="font-medium">تم إنشاء المعمل بنجاح ✅</p><p className="mt-1 text-muted">{success}</p></div></div> : null}
        {error ? <p className="mt-5 rounded-lg border border-high/20 bg-high/5 px-4 py-3 text-sm text-high">{error}</p> : null}

        <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_1.2fr]">
          <section className="rounded-xl border border-line bg-elevated p-5 sm:p-6">
            <div className="flex items-center justify-between gap-3">
              <div><h3 className="font-display text-xl font-semibold">المعامل الحالية</h3><p className="mt-1 text-sm text-muted">{labs.length} معمل مسجل</p></div>
              {canCreate ? <Button type="button" variant="outline" onClick={() => setShowForm(true)}><Plus className="size-4" /> إضافة</Button> : null}
            </div>
            <div className="mt-5 space-y-3">
              {labs.length === 0 ? <p className="rounded-lg border border-dashed border-line px-4 py-8 text-center text-sm text-muted">لسه مفيش معامل. أضف أول معمل من النموذج.</p> : labs.map((lab) => (
                <div key={lab.id} className="rounded-lg border border-line p-4">
                  <div className="flex items-start gap-3">
                    <div className="grid size-10 shrink-0 place-items-center rounded-lg bg-teal/10 text-teal"><Building2 className="size-5" /></div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium">{lab.name}</p>
                        <span className={`rounded-full px-2 py-0.5 text-[11px] ${lab.phone && lab.address ? "bg-ok/10 text-ok" : "bg-amber-500/10 text-amber-700"}`}>{lab.phone && lab.address ? "بيانات مكتملة" : "في انتظار بيانات المعمل"}</span>
                        <span className={`rounded-full px-2 py-0.5 text-[11px] ${lab.isActive ? "bg-ok/10 text-ok" : "bg-high/10 text-high"}`}>{lab.isActive ? "نشط" : "موقوف"}</span>
                      </div>
                      <p className="mt-1 text-xs text-muted">Username: <span dir="ltr">{lab.username}</span></p>
                      {lab.doctorName ? <p className="mt-1 text-xs text-muted">مدير المعمل: {lab.doctorName}</p> : null}

                      {(canSuspend || canDelete) ? (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {canSuspend ? (
                            <Button size="sm" variant={lab.isActive ? "secondary" : "primary"} disabled={busyId === lab.id} onClick={() => toggleActive(lab)}>
                              {lab.isActive ? <Pause /> : <Play />}{lab.isActive ? "إيقاف" : "تفعيل"}
                            </Button>
                          ) : null}
                          {canDelete ? (
                            <Button size="sm" variant="danger" disabled={busyId === lab.id} onClick={() => remove(lab)}><Trash2 />حذف</Button>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {showForm && canCreate ? <section className="rounded-xl border border-line bg-elevated p-5 sm:p-6">
            <div className="mb-6 flex items-center gap-3"><div className="grid size-10 place-items-center rounded-lg bg-teal/10 text-teal"><ShieldCheck className="size-5" /></div><div><h3 className="font-display text-xl font-semibold">بيانات المعمل</h3><p className="text-sm text-muted">البيانات دي هتظهر في تقارير المعمل لاحقًا.</p></div></div>
            <form onSubmit={submit} className="space-y-4">
              <div className="rounded-lg border border-teal/20 bg-teal/5 p-4 text-sm leading-6 text-ink-soft">
                <strong>خطوة المدير:</strong> أنشئ اسم المستخدم وكلمة المرور. لا تحتاج لإدخال بيانات المعمل الآن.
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field id="username" label="اسم المستخدم" value={username} onChange={setUsername} required placeholder="noor_lab" dir="ltr" />
                <Field id="password" label="كلمة المرور" value={password} onChange={setPassword} required type="password" minLength={8} placeholder="8 أحرف على الأقل" dir="ltr" />
              </div>
              <div className="rounded-lg border border-line bg-paper/50 p-4">
                <p className="font-medium">بعد أول دخول 🏥</p>
                <p className="mt-1 text-sm leading-6 text-muted">سيتم توجيه صاحب الحساب تلقائيًا إلى صفحة إعداد المعمل لإدخال الاسم، العنوان، الهاتف، واتساب، البريد، بيانات الطبيب وغيرها.</p>
              </div>
              {error ? <p className="rounded-lg border border-high/20 bg-high/5 px-3 py-2 text-sm text-high">{error}</p> : null}
              <div className="flex flex-wrap gap-3 pt-2"><Button type="submit" size="lg" disabled={loading}>{loading ? "جارٍ إنشاء المعمل…" : "إنشاء المعمل"}</Button><Button type="button" variant="outline" onClick={() => setShowForm(false)}>إلغاء</Button></div>
            </form>
          </section> : (canCreate ? <section className="grid min-h-[320px] place-items-center rounded-xl border border-dashed border-line bg-elevated p-8 text-center"><div><div className="mx-auto grid size-12 place-items-center rounded-xl bg-teal/10 text-teal"><Plus className="size-6" /></div><h3 className="mt-4 font-display text-xl font-semibold">جاهز لإضافة معمل جديد</h3><p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-muted">اضغط «إضافة» لإنشاء حساب المعمل وتحديد اسم المستخدم وكلمة المرور.</p><Button className="mt-5" onClick={() => setShowForm(true)}>إضافة معمل</Button></div></section> : null)}
        </div>
      </div>
    </main>
  );
}

function Field({ id, label, value, onChange, required, placeholder, dir, type = "text", minLength }: { id: string; label: string; value: string; onChange: (value: string) => void; required?: boolean; placeholder?: string; dir?: "ltr" | "rtl"; type?: string; minLength?: number }) {
  return <div className="space-y-1.5"><Label htmlFor={id}>{label}</Label><Input id={id} type={type} value={value} onChange={(e) => onChange(e.target.value)} required={required} minLength={minLength} placeholder={placeholder} dir={dir} /></div>;
}
