import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { InstallBanner } from "@/components/install-banner";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  const [saving, setSaving] = useState(false);

  if (lab.role !== "owner") {
    return <Navigate to="/lab" />;
  }

  async function save(e: import("react").FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await updateCurrentLabProfile({
        data: { name, nameEn, phone, whatsapp, email, website, address, doctorName, doctorDegree, doctorSpecialty },
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
