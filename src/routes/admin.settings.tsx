import { useState, type FormEvent, type ReactNode } from "react";
import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { ArrowRight, Building2, Database, FileText, LockKeyhole, Mail, Megaphone, MessageCircle, Settings2, ToggleRight, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { isPlatformAdmin } from "@/lib/platform-admin";
import {
  ANNOUNCEMENT_MAX_LENGTH,
  SUPPORT_TEXT_MAX_LENGTH,
  getLabsOverview,
  getPlatformSettingsAdmin,
  setLabFeature,
  updatePlatformSettings,
  type LabsOverview,
  type PlatformSettingsAdminView,
} from "@/lib/platform-settings";
import { LAB_FEATURES } from "@/lib/lab-features";

export const Route = createFileRoute("/admin/settings")({
  loader: async () => {
    try {
      const isAdmin = await isPlatformAdmin();
      if (!isAdmin) return { isAdmin: false, settings: null as PlatformSettingsAdminView | null, overview: null as LabsOverview | null };
      // Only the super admin may read/edit; other admins see the read-only cards.
      const [settings, overview] = await Promise.all([
        getPlatformSettingsAdmin().catch(() => null),
        getLabsOverview().catch(() => null),
      ]);
      return { isAdmin, settings, overview };
    } catch {
      return { isAdmin: false, settings: null as PlatformSettingsAdminView | null, overview: null as LabsOverview | null };
    }
  },
  component: AdminSettings,
});

function AdminSettings() {
  const { isAdmin, settings, overview } = Route.useLoaderData();
  if (!isAdmin) return <Navigate to="/login" />;

  return (
    <main className="min-h-screen bg-paper">
      <header className="border-b border-line bg-elevated">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
          <div>
            <p className="text-[11px] uppercase tracking-[0.2em] text-muted">Central administration</p>
            <h1 className="mt-1 font-display text-xl font-semibold">إعدادات النظام ⚙️</h1>
          </div>
          <Link to="/admin" className="inline-flex items-center gap-2 text-sm text-teal hover:underline">
            <ArrowRight className="size-4" /> لوحة التحكم
          </Link>
        </div>
      </header>

      <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6">
        <section className="rounded-2xl bg-ink p-6 text-paper sm:p-8">
          <p className="text-sm text-paper/60">Microscopic System</p>
          <h2 className="mt-2 font-display text-3xl font-semibold">إعدادات الشبكة المركزية</h2>
          <p className="mt-3 text-sm leading-7 text-paper/65">
            المكان المخصص لإعدادات المنصة العامة. البيانات الحساسة لا تظهر هنا ولا يتم حفظ كلمات المرور داخل جداول المعامل.
          </p>
        </section>

        {overview ? <StatsSection overview={overview} /> : null}

        {settings ? (
          <SettingsForm initial={settings} />
        ) : (
          <div className="mt-6 rounded-xl border border-dashed border-line bg-elevated p-5 text-sm leading-7 text-muted">
            تعديل إعدادات المنصة متاح للمدير الرئيسي (Super Admin) فقط.
          </div>
        )}

        {overview ? <FeaturesSection overview={overview} /> : null}

        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          <InfoCard icon={<Database />} title="قاعدة البيانات" text="Neon + PostgreSQL" />
          <InfoCard icon={<LockKeyhole />} title="الحماية" text="حسابات وصلاحيات معزولة" />
          <InfoCard icon={<Settings2 />} title="المنصة" text="Multi-Lab V1" />
        </div>
      </div>
    </main>
  );
}

function SettingsForm({ initial }: { initial: PlatformSettingsAdminView }) {
  const [whatsapp, setWhatsapp] = useState(initial.supportWhatsapp);
  const [announcement, setAnnouncement] = useState(initial.announcement);
  const [expiresAt, setExpiresAt] = useState(initial.announcementExpiresAt);
  const [expired, setExpired] = useState(initial.announcementExpired);
  const [email, setEmail] = useState(initial.supportEmail);
  const [website, setWebsite] = useState(initial.websiteUrl);
  const [supportText, setSupportText] = useState(initial.supportText);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  async function save(e: FormEvent) {
    e.preventDefault();
    setError("");
    setSaved(false);
    setSaving(true);
    try {
      const result = await updatePlatformSettings({
        data: {
          supportWhatsapp: whatsapp,
          announcement,
          announcementExpiresAt: expiresAt,
          supportEmail: email,
          websiteUrl: website,
          supportText,
        },
      });
      setWhatsapp(result.supportWhatsapp);
      setAnnouncement(result.announcement);
      setExpiresAt(result.announcementExpiresAt);
      setExpired(result.announcementExpired);
      setEmail(result.supportEmail);
      setWebsite(result.websiteUrl);
      setSupportText(result.supportText);
      setSaved(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      setError(msg === "SUPER_ADMIN_REQUIRED" ? "التعديل للمدير الرئيسي فقط." : msg || "تعذر حفظ الإعدادات");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={save} className="mt-6 space-y-6 rounded-2xl border border-line bg-elevated p-5 sm:p-7">
      <div>
        <div className="flex items-center gap-2 text-sm font-medium">
          <MessageCircle className="size-4 text-teal" /> رقم الدعم على واتساب
        </div>
        <p className="mt-1 text-xs leading-6 text-muted">
          بيظهر في صفحة تسجيل الدخول (زر التواصل وطلب إنشاء حساب). اكتب الرقم بأي صيغة، مثل 01012345678.
        </p>
        <div className="mt-3 max-w-sm space-y-1.5">
          <Label>الرقم</Label>
          <Input value={whatsapp} onChange={(e) => { setWhatsapp(e.target.value); setSaved(false); }} dir="ltr" required />
        </div>
      </div>

      <div className="border-t border-line pt-6">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Mail className="size-4 text-teal" /> بيانات التواصل
        </div>
        <p className="mt-1 text-xs leading-6 text-muted">
          كلها اختيارية، وبتظهر في صفحة تسجيل الدخول تحت زر الواتساب. اللي تسيبه فاضي مش هيظهر.
        </p>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>البريد الإلكتروني للدعم</Label>
            <Input type="email" value={email} onChange={(e) => { setEmail(e.target.value); setSaved(false); }} dir="ltr" placeholder="support@example.com" />
          </div>
          <div className="space-y-1.5">
            <Label>رابط الموقع</Label>
            <Input value={website} onChange={(e) => { setWebsite(e.target.value); setSaved(false); }} dir="ltr" placeholder="https://microscopic.vercel.app" />
          </div>
        </div>
        <div className="mt-4 space-y-1.5">
          <Label>نص الدعم</Label>
          <textarea
            value={supportText}
            onChange={(e) => { setSupportText(e.target.value); setSaved(false); }}
            maxLength={SUPPORT_TEXT_MAX_LENGTH}
            rows={2}
            placeholder="مثال: الدعم متاح من 9 صباحًا حتى 9 مساءً."
            className="w-full rounded-sm border border-line bg-paper p-3 text-sm"
          />
          <p className="text-[11px] text-muted">{supportText.length} / {SUPPORT_TEXT_MAX_LENGTH}</p>
        </div>
      </div>

      <div className="border-t border-line pt-6">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Megaphone className="size-4 text-teal" /> إعلان لكل المعامل
        </div>
        <p className="mt-1 text-xs leading-6 text-muted">
          بيظهر كشريط في أعلى كل صفحات المعمل لكل المستخدمين. سيبه فاضي لو مفيش إعلان.
        </p>
        <textarea
          value={announcement}
          onChange={(e) => { setAnnouncement(e.target.value); setSaved(false); }}
          maxLength={ANNOUNCEMENT_MAX_LENGTH}
          rows={3}
          placeholder="مثال: صيانة مجدولة الجمعة من 2 لـ 4 الفجر."
          className="mt-3 w-full rounded-sm border border-line bg-paper p-3 text-sm"
        />
        <p className="mt-1 text-[11px] text-muted">{announcement.length} / {ANNOUNCEMENT_MAX_LENGTH}</p>

        <div className="mt-4 max-w-xs space-y-1.5">
          <Label>ينتهي في (اختياري)</Label>
          <Input
            type="date"
            value={expiresAt}
            onChange={(e) => { setExpiresAt(e.target.value); setSaved(false); }}
            dir="ltr"
          />
          <p className="text-[11px] leading-5 text-muted">
            الإعلان بيختفي تلقائيًا بعد اليوم ده (بتوقيت القاهرة). سيبه فاضي لو عايزه يفضل لحد ما تمسحه.
          </p>
          {expired && announcement ? (
            <p role="status" className="text-xs text-high">الإعلان ده انتهى ومش ظاهر للمستخدمين. غيّر التاريخ أو امسحه عشان يظهر تاني.</p>
          ) : null}
        </div>
      </div>

      {error ? <p role="alert" className="rounded-lg border border-high/20 bg-high/5 px-3 py-2 text-sm text-high">{error}</p> : null}
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={saving}>{saving ? "جارٍ الحفظ…" : "حفظ الإعدادات"}</Button>
        {saved ? <span className="text-sm text-muted">اتحفظت ✓</span> : null}
      </div>
    </form>
  );
}

function InfoCard({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
  return (
    <div className="rounded-xl border border-line bg-elevated p-5">
      <div className="grid size-10 place-items-center rounded-lg bg-teal/10 text-teal">{icon}</div>
      <h3 className="mt-4 font-semibold">{title}</h3>
      <p className="mt-1 text-sm text-muted">{text}</p>
    </div>
  );
}

function formatDate(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("ar-EG", { day: "numeric", month: "numeric", year: "numeric", timeZone: "Africa/Cairo" });
}

function StatsSection({ overview }: { overview: LabsOverview }) {
  const { totals, labs } = overview;
  return (
    <section className="mt-6 rounded-2xl border border-line bg-elevated p-5 sm:p-7">
      <div className="flex items-center gap-2 text-sm font-medium">
        <Building2 className="size-4 text-teal" /> إحصائيات المعامل
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="المعامل" value={`${totals.activeLabs} / ${totals.labs}`} hint="نشط من الإجمالي" />
        <Stat label="التقارير" value={totals.reports} />
        <Stat label="المرضى" value={totals.patients} />
        <Stat label="المستخدمين" value={totals.users} hint="الحسابات النشطة" />
      </div>

      {labs.length ? (
        <ul className="mt-5 divide-y divide-line rounded-xl border border-line">
          {labs.map((lab) => (
            <li key={lab.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">
                  {lab.name}
                  {!lab.isActive ? <span className="ms-2 rounded bg-high/10 px-1.5 py-0.5 text-[10px] font-medium text-high">موقوف</span> : null}
                </p>
                <p className="mt-0.5 text-[11px] text-muted">آخر تقرير: {formatDate(lab.lastReportAt)}</p>
              </div>
              <div className="flex items-center gap-4 text-xs text-muted">
                <span className="inline-flex items-center gap-1" title="التقارير (آخر 30 يوم)"><FileText className="size-3.5" />{lab.reports} <span className="text-[10px]">({lab.reportsLast30Days} / 30ي)</span></span>
                <span className="inline-flex items-center gap-1" title="المرضى"><Users className="size-3.5" />{lab.patients}</span>
                <span className="inline-flex items-center gap-1" title="المستخدمين النشطين">👤 {lab.users}</span>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 text-sm text-muted">مفيش معامل لسه.</p>
      )}
    </section>
  );
}

function Stat({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="rounded-xl border border-line bg-paper p-3">
      <p className="text-[11px] text-muted">{label}</p>
      <p className="mt-1 font-display text-2xl font-semibold" dir="ltr">{value}</p>
      {hint ? <p className="mt-0.5 text-[10px] text-muted">{hint}</p> : null}
    </div>
  );
}

function FeaturesSection({ overview }: { overview: LabsOverview }) {
  const [disabled, setDisabled] = useState<Record<string, string[]>>(
    () => Object.fromEntries(overview.labs.map((l) => [l.id, l.disabledFeatures])),
  );
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  async function toggle(labId: string, feature: string, enabled: boolean) {
    const id = `${labId}:${feature}`;
    setBusy(id);
    setError("");
    try {
      const res = await setLabFeature({ data: { labId, feature, enabled } });
      setDisabled((d) => ({ ...d, [labId]: res.disabledFeatures }));
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      setError(msg === "SUPER_ADMIN_REQUIRED" ? "التعديل للمدير الرئيسي فقط." : msg || "تعذر تغيير الميزة");
    } finally {
      setBusy("");
    }
  }

  return (
    <section className="mt-6 rounded-2xl border border-line bg-elevated p-5 sm:p-7">
      <div className="flex items-center gap-2 text-sm font-medium">
        <ToggleRight className="size-4 text-teal" /> ميزات المنصة لكل معمل
      </div>
      <p className="mt-1 text-xs leading-6 text-muted">
        كل الميزات شغالة افتراضيًا. لو وقفت ميزة، المعمل مش هيقدر يستخدمها وهتظهر له رسالة إنها متوقفة.
      </p>
      {error ? <p role="alert" className="mt-3 rounded-lg border border-high/20 bg-high/5 px-3 py-2 text-sm text-high">{error}</p> : null}

      {overview.labs.length ? (
        <ul className="mt-4 space-y-3">
          {overview.labs.map((lab) => (
            <li key={lab.id} className="rounded-xl border border-line bg-paper p-4">
              <p className="text-sm font-semibold">{lab.name}</p>
              <div className="mt-3 space-y-2.5">
                {LAB_FEATURES.map((f) => {
                  const on = !(disabled[lab.id] ?? []).includes(f.key);
                  const id = `${lab.id}:${f.key}`;
                  return (
                    <label key={f.key} className="flex cursor-pointer items-start gap-3">
                      <input
                        type="checkbox"
                        checked={on}
                        disabled={busy === id}
                        onChange={(e) => toggle(lab.id, f.key, e.target.checked)}
                        className="mt-1 size-4 accent-teal"
                      />
                      <span className="min-w-0">
                        <span className="block text-sm">{f.label} <span className={on ? "text-[11px] text-teal" : "text-[11px] text-high"}>{on ? "شغالة" : "موقوفة"}</span></span>
                        <span className="block text-[11px] leading-5 text-muted">{f.hint}</span>
                      </span>
                    </label>
                  );
                })}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 text-sm text-muted">مفيش معامل لسه.</p>
      )}
    </section>
  );
}
