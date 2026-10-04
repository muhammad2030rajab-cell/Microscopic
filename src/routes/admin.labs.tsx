import { useEffect, useState, type FormEvent } from "react";
import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { ArrowRight, Building2, CheckCircle2, CreditCard, Pause, Play, Plus, Search, ShieldCheck, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  isPlatformAdmin, createLab, listAdminLabs, toggleLabActive, deleteLab,
  getCurrentPlatformPermissions, type AdminLab, type PlatformPermissions,
} from "@/lib/platform-admin";
import { updateLabPlan } from "@/lib/platform-settings";
import { PLAN_PRESETS, daysLeft, subscriptionState } from "@/lib/lab-plans";

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
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<LabFilter>("all");
  const [planOpenId, setPlanOpenId] = useState<string | null>(null);

  useEffect(() => setLabs(initialLabs), [initialLabs]);

  if (!isAdmin) return <Navigate to="/login" />;
  const canCreate = isSuper || permissions["labs.create"] === true;
  const canSuspend = isSuper || permissions["labs.suspend"] === true;
  const canDelete = isSuper || permissions["labs.delete"] === true;
  const q = query.trim().toLowerCase();
  const filtered = labs.filter((lab) => {
    if (q && ![lab.name, lab.nameEn, lab.username, lab.doctorName, lab.phone].some((v) => v?.toLowerCase().includes(q))) return false;
    return matchesFilter(lab, filter);
  });

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
        planName: null,
        maxUsers: null,
        maxReportsPerMonth: null,
        subscriptionEndsAt: null,
        activeUsers: 1,
        reportsThisMonth: 0,
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
            {labs.length > 0 ? (
              <div className="mt-4 space-y-3">
                <div className="relative">
                  <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
                  <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="ابحث بالاسم أو اليوزر أو الدكتور أو الهاتف" className="ps-9" aria-label="بحث في المعامل" />
                </div>
                <div className="flex flex-wrap gap-2" role="group" aria-label="تصفية المعامل">
                  {FILTERS.map((f) => (
                    <button
                      key={f.key}
                      type="button"
                      onClick={() => setFilter(f.key)}
                      aria-pressed={filter === f.key}
                      className={`rounded-full border px-3 py-1 text-xs transition-colors ${filter === f.key ? "border-teal bg-teal text-teal-fg" : "border-line bg-paper text-muted hover:text-ink"}`}
                    >
                      {f.label} <span dir="ltr">({labs.filter((l) => matchesFilter(l, f.key)).length})</span>
                    </button>
                  ))}
                </div>
                {q || filter !== "all" ? <p className="text-xs text-muted">{filtered.length} من {labs.length}</p> : null}
              </div>
            ) : null}
            <div className="mt-5 space-y-3">
              {labs.length === 0 ? <p className="rounded-lg border border-dashed border-line px-4 py-8 text-center text-sm text-muted">لسه مفيش معامل. أضف أول معمل من النموذج.</p> : filtered.length === 0 ? <p className="rounded-lg border border-dashed border-line px-4 py-8 text-center text-sm text-muted">مفيش معمل مطابق للبحث أو التصفية.</p> : filtered.map((lab) => (
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
                      <PlanSummary lab={lab} />

                      {(canSuspend || canDelete || isSuper) ? (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {isSuper ? (
                            <Button size="sm" variant="outline" onClick={() => setPlanOpenId(planOpenId === lab.id ? null : lab.id)}>
                              <CreditCard />الباقة
                            </Button>
                          ) : null}
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
                      {isSuper && planOpenId === lab.id ? (
                        <PlanEditor
                          lab={lab}
                          onSaved={(plan) => {
                            setLabs((current) => current.map((l) => (l.id === lab.id ? { ...l, ...plan } : l)));
                            setPlanOpenId(null);
                          }}
                        />
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

type LabFilter = "all" | "active" | "suspended" | "expiring" | "expired" | "incomplete";

const FILTERS: { key: LabFilter; label: string }[] = [
  { key: "all", label: "الكل" },
  { key: "active", label: "نشط" },
  { key: "suspended", label: "موقوف" },
  { key: "expiring", label: "اشتراك قارب على الانتهاء" },
  { key: "expired", label: "اشتراك منتهي" },
  { key: "incomplete", label: "بيانات ناقصة" },
];

function matchesFilter(lab: AdminLab, filter: LabFilter): boolean {
  switch (filter) {
    case "active": return lab.isActive;
    case "suspended": return !lab.isActive;
    case "expiring": return subscriptionState(lab.subscriptionEndsAt) === "expiring";
    case "expired": return subscriptionState(lab.subscriptionEndsAt) === "expired";
    case "incomplete": return !(lab.phone && lab.address);
    default: return true;
  }
}

function planLabel(planName: string | null) {
  return PLAN_PRESETS.find((p) => p.key === planName)?.label ?? null;
}

function PlanSummary({ lab }: { lab: AdminLab }) {
  const state = subscriptionState(lab.subscriptionEndsAt);
  const left = lab.subscriptionEndsAt ? daysLeft(lab.subscriptionEndsAt) : null;
  const users = lab.maxUsers == null ? `${lab.activeUsers}` : `${lab.activeUsers} / ${lab.maxUsers}`;
  const reports = lab.maxReportsPerMonth == null ? `${lab.reportsThisMonth}` : `${lab.reportsThisMonth} / ${lab.maxReportsPerMonth}`;
  const nearLimit = (used: number, max: number | null) => max != null && used >= max;
  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted">
      <span className="rounded-full bg-teal/10 px-2 py-0.5 text-teal">{planLabel(lab.planName) ?? "بدون باقة"}</span>
      <span className={nearLimit(lab.activeUsers, lab.maxUsers) ? "text-high" : ""}>👤 <span dir="ltr">{users}</span></span>
      <span className={nearLimit(lab.reportsThisMonth, lab.maxReportsPerMonth) ? "text-high" : ""}>📄 <span dir="ltr">{reports}</span> هذا الشهر</span>
      {state === "expired" ? <span className="rounded-full bg-high/10 px-2 py-0.5 text-high">الاشتراك انتهى</span> : null}
      {state === "expiring" && left !== null ? <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-amber-700">{left === 0 ? "ينتهي النهاردة" : `باقي ${left} يوم`}</span> : null}
      {state === "active" && lab.subscriptionEndsAt ? <span>ينتهي <span dir="ltr">{lab.subscriptionEndsAt}</span></span> : null}
    </div>
  );
}

function PlanEditor({ lab, onSaved }: { lab: AdminLab; onSaved: (plan: Pick<AdminLab, "planName" | "maxUsers" | "maxReportsPerMonth" | "subscriptionEndsAt">) => void }) {
  const [planName, setPlanName] = useState(lab.planName ?? "");
  const [maxUsers, setMaxUsers] = useState(lab.maxUsers?.toString() ?? "");
  const [maxReports, setMaxReports] = useState(lab.maxReportsPerMonth?.toString() ?? "");
  const [endsAt, setEndsAt] = useState(lab.subscriptionEndsAt ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function pickPreset(key: string) {
    setPlanName(key);
    const preset = PLAN_PRESETS.find((p) => p.key === key);
    if (preset) {
      setMaxUsers(preset.maxUsers?.toString() ?? "");
      setMaxReports(preset.maxReportsPerMonth?.toString() ?? "");
    }
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    setError("");
    setSaving(true);
    try {
      const res = await updateLabPlan({
        data: {
          labId: lab.id,
          planName: planName || null,
          maxUsers: maxUsers.trim() ? Number(maxUsers) : null,
          maxReportsPerMonth: maxReports.trim() ? Number(maxReports) : null,
          subscriptionEndsAt: endsAt || null,
        },
      });
      onSaved({ planName: res.planName, maxUsers: res.maxUsers, maxReportsPerMonth: res.maxReportsPerMonth, subscriptionEndsAt: res.subscriptionEndsAt });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      setError(msg === "SUPER_ADMIN_REQUIRED" ? "التعديل للمدير الرئيسي فقط." : msg || "تعذر حفظ الباقة");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={save} className="mt-4 space-y-3 rounded-lg border border-line bg-paper p-4">
      <div className="space-y-1.5">
        <Label>الباقة</Label>
        <div className="flex flex-wrap gap-2">
          {PLAN_PRESETS.map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => pickPreset(p.key)}
              aria-pressed={planName === p.key}
              className={`rounded-full border px-3 py-1 text-xs ${planName === p.key ? "border-teal bg-teal text-teal-fg" : "border-line bg-elevated text-muted"}`}
            >
              {p.label}
            </button>
          ))}
        </div>
        <p className="text-[11px] text-muted">اختيار باقة بيملا الحدود تحت، وتقدر تعدّلها بعدها.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>أقصى عدد مستخدمين</Label>
          <Input type="number" min={1} value={maxUsers} onChange={(e) => setMaxUsers(e.target.value)} dir="ltr" placeholder="فاضي = بلا حد" />
        </div>
        <div className="space-y-1.5">
          <Label>أقصى تقارير في الشهر</Label>
          <Input type="number" min={1} value={maxReports} onChange={(e) => setMaxReports(e.target.value)} dir="ltr" placeholder="فاضي = بلا حد" />
        </div>
      </div>
      <div className="max-w-xs space-y-1.5">
        <Label>ينتهي الاشتراك في</Label>
        <Input type="date" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} dir="ltr" />
        <p className="text-[11px] leading-5 text-muted">بعد التاريخ ده المعمل يقدر يتصفح بياناته بس، ومايقدرش يضيف تقارير أو مستخدمين. فاضي = بلا انتهاء.</p>
      </div>
      {error ? <p role="alert" className="rounded-lg border border-high/20 bg-high/5 px-3 py-2 text-sm text-high">{error}</p> : null}
      <Button type="submit" size="sm" disabled={saving}>{saving ? "جارٍ الحفظ…" : "حفظ الباقة"}</Button>
    </form>
  );
}
