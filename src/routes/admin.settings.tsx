import { useState, type FormEvent, type ReactNode } from "react";
import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { ArrowRight, Database, LockKeyhole, Megaphone, MessageCircle, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { isPlatformAdmin } from "@/lib/platform-admin";
import {
  ANNOUNCEMENT_MAX_LENGTH,
  getPlatformSettingsAdmin,
  updatePlatformSettings,
  type PlatformSettingsAdminView,
} from "@/lib/platform-settings";

export const Route = createFileRoute("/admin/settings")({
  loader: async () => {
    try {
      const isAdmin = await isPlatformAdmin();
      if (!isAdmin) return { isAdmin: false, settings: null as PlatformSettingsAdminView | null };
      // Only the super admin may read/edit; other admins see the read-only cards.
      const settings = await getPlatformSettingsAdmin().catch(() => null);
      return { isAdmin, settings };
    } catch {
      return { isAdmin: false, settings: null as PlatformSettingsAdminView | null };
    }
  },
  component: AdminSettings,
});

function AdminSettings() {
  const { isAdmin, settings } = Route.useLoaderData();
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

        {settings ? (
          <SettingsForm initial={settings} />
        ) : (
          <div className="mt-6 rounded-xl border border-dashed border-line bg-elevated p-5 text-sm leading-7 text-muted">
            تعديل إعدادات المنصة متاح للمدير الرئيسي (Super Admin) فقط.
          </div>
        )}

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
        data: { supportWhatsapp: whatsapp, announcement, announcementExpiresAt: expiresAt },
      });
      setWhatsapp(result.supportWhatsapp);
      setAnnouncement(result.announcement);
      setExpiresAt(result.announcementExpiresAt);
      setExpired(result.announcementExpired);
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
