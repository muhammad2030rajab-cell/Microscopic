import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { toast } from "sonner";
import { InstallBanner } from "@/components/install-banner";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ReportDesignEditor } from "@/components/report/report-design-editor";
import { getCurrentLab, updateCurrentLabProfile, type LabProfileData } from "@/lib/lab-access";

export const Route = createFileRoute("/settings")({
  loader: async () => {
    try {
      return { lab: await getCurrentLab() };
    } catch {
      return { lab: null as LabProfileData | null };
    }
  },
  component: SettingsPage,
});

function SettingsPage() {
  const { lab } = Route.useLoaderData();
  if (!lab) return <Navigate to="/login" replace />;
  return <SettingsForm lab={lab} />;
}

function SettingsForm({ lab }: { lab: LabProfileData }) {
  const [name, setName] = useState(lab.lab_name);
  const [nameEn, setNameEn] = useState(lab.lab_name_en ?? "");
  const [phone, setPhone] = useState(lab.phone ?? "");
  const [whatsapp, setWhatsapp] = useState(lab.whatsapp ?? "");
  const [email, setEmail] = useState(lab.email ?? "");
  const [website, setWebsite] = useState(lab.website ?? "");
  const [address, setAddress] = useState(lab.address ?? "");
  const [doctorName, setDoctorName] = useState(lab.doctor_name ?? "");
  const [doctorDegree, setDoctorDegree] = useState(lab.doctor_degree ?? "");
  const [doctorSpecialty, setDoctorSpecialty] = useState(lab.doctor_specialty ?? "");
  const [logoUrl, setLogoUrl] = useState(lab.logo_url ?? "");
  const [reportLanguage, setReportLanguage] = useState(lab.report_language ?? "bilingual");
  const [saving, setSaving] = useState(false);

  const previewProfile = useMemo(
    () => ({
      name, nameEn: nameEn || name, phone, address, email, website, doctorName, doctorDegree, doctorSpecialty,
      logoUrl: logoUrl || undefined,
      reportLanguage: reportLanguage as "bilingual" | "ar" | "en",
    }),
    [name, nameEn, phone, address, email, website, doctorName, doctorDegree, doctorSpecialty, logoUrl, reportLanguage],
  );

  if (lab.role !== "owner") {
    return <Navigate to="/lab" />;
  }

  function onLogoChange(e: import("react").ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 500_000) {
      toast.error("حجم الصورة كبير — اختر شعارًا أصغر من 500 كيلوبايت");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setLogoUrl(String(reader.result));
    reader.readAsDataURL(file);
  }

  async function save(e: import("react").FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await updateCurrentLabProfile({
        data: { name, nameEn, phone, whatsapp, email, website, address, doctorName, doctorDegree, doctorSpecialty, logoUrl, reportLanguage },
      });
      toast.success("تم حفظ بيانات المعمل على النظام");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر حفظ البيانات");
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppShell>
      <header className="mb-6">
        <p className="text-xs uppercase tracking-[0.18em] text-muted">المختبر</p>
        <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight">بيانات المعمل</h1>
        <p className="mt-2 max-w-xl text-sm text-ink-soft">
          البيانات دي محفوظة للمعمل نفسه وبتظهر في التقارير المطبوعة.
        </p>
      </header>

      <form onSubmit={save} className="mx-auto max-w-2xl space-y-4 rounded-lg border border-line bg-elevated p-5 sm:p-7">
        <div className="flex items-center gap-4">
          <div className="grid size-14 shrink-0 place-items-center overflow-hidden rounded-xl border border-line bg-paper text-muted">
            {logoUrl ? <img src={logoUrl} alt="شعار المعمل" className="size-full object-cover" /> : "🔬"}
          </div>
          <div className="min-w-0">
            <Label htmlFor="lab-logo">شعار المعمل</Label>
            <input id="lab-logo" type="file" accept="image/*" onChange={onLogoChange} className="mt-1 block w-full max-w-full text-xs text-muted file:mr-2 file:rounded-md file:border-0 file:bg-teal/10 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-teal" />
            <p className="mt-1 text-[11px] text-muted">هيظهر تلقائيًا في كل تقرير تطبعه (حد أقصى 500 كيلوبايت)</p>
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="report-language">لغة التقرير المطبوع</Label>
          <select
            id="report-language"
            value={reportLanguage}
            onChange={(e) => setReportLanguage(e.target.value as typeof reportLanguage)}
            className="flex h-10 w-full rounded-md border border-line bg-paper px-3 text-sm"
          >
            <option value="bilingual">ثنائي اللغة (عربي + إنجليزي، الوضع الحالي)</option>
            <option value="ar">عربي بالكامل</option>
            <option value="en">إنجليزي بالكامل</option>
          </select>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="اسم المعمل" value={name} onChange={setName} required />
          <Field label="الاسم الإنجليزي" value={nameEn} onChange={setNameEn} dir="ltr" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="الهاتف" value={phone} onChange={setPhone} dir="ltr" />
          <Field label="واتساب" value={whatsapp} onChange={setWhatsapp} dir="ltr" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="البريد" value={email} onChange={setEmail} dir="ltr" />
          <Field label="الموقع الإلكتروني" value={website} onChange={setWebsite} dir="ltr" />
        </div>
        <div><Label>العنوان</Label><Textarea value={address} onChange={(e) => setAddress(e.target.value)} /></div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="اسم الطبيب المسؤول" value={doctorName} onChange={setDoctorName} />
          <Field label="الشهادة" value={doctorDegree} onChange={setDoctorDegree} />
        </div>
        <Field label="التخصص" value={doctorSpecialty} onChange={setDoctorSpecialty} />
        <div className="flex flex-wrap gap-3 pt-2">
          <Button type="submit" disabled={saving}>{saving ? "جارٍ الحفظ…" : "حفظ بيانات المعمل"}</Button>
        </div>
      </form>

      <ReportDesignEditor
        labId={lab.lab_id}
        initialDesign={lab.report_design}
        lab={previewProfile}
      />
      <InstallBanner />
    </AppShell>
  );
}

function Field({
  label,
  value,
  onChange,
  dir,
  required,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  dir?: "ltr" | "rtl";
  required?: boolean;
}) {
  return (
    <div>
      <Label>{label}</Label>
      <Input dir={dir} value={value} onChange={(e) => onChange(e.target.value)} required={required} />
    </div>
  );
}
