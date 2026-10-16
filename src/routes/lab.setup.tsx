import { useState, type FormEvent, type ReactNode } from "react";
import { createFileRoute, Navigate, useNavigate, useRouter } from "@tanstack/react-router";
import { Building2, Phone, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getCurrentLab, updateCurrentLabProfile, type LabProfileData } from "@/lib/lab-access";

export const Route = createFileRoute("/lab/setup")({
  loader: async () => {
    try {
      return { lab: await getCurrentLab() };
    } catch {
      return { lab: null as LabProfileData | null };
    }
  },
  component: LabSetupPage,
});

function LabSetupPage() {
  const { lab } = Route.useLoaderData();
  if (!lab) return <Navigate to="/login" replace />;
  if (lab.role !== "owner") {
    return (
      <main className="grid min-h-screen place-items-center bg-paper px-4 text-center">
        <div className="max-w-sm space-y-3">
          <p className="text-lg font-semibold">بيانات المعمل لسه ما اتكملتش</p>
          <p className="text-sm text-muted">
            إكمال بيانات المعمل بيتم من حساب صاحب المعمل (owner). اطلب منه يدخل ويكمّلها، وبعدها هتقدر تستخدم النظام.
          </p>
        </div>
      </main>
    );
  }
  return <LabSetupForm lab={lab} />;
}

function LabSetupForm({ lab }: { lab: LabProfileData }) {
  const navigate = useNavigate();
  const router = useRouter();
  const [name, setName] = useState(lab.lab_name === "معمل جديد" ? "" : lab.lab_name);
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
  const [error, setError] = useState("");

  async function save(e: FormEvent) {
    e.preventDefault();
    setError("");
    const missing: string[] = [];
    if (name.trim().length < 2) missing.push("اسم المعمل");
    if (phone.trim().length < 5) missing.push("رقم الهاتف");
    if (address.trim().length < 5) missing.push("العنوان بالتفصيل");
    if (missing.length) {
      setError(`لازم تكتب: ${missing.join("، ")}. (الكلام الرمادي مجرد مثال مش بيانات.)`);
      return;
    }
    setSaving(true);
    try {
      await updateCurrentLabProfile({ data: { name, nameEn, phone, whatsapp, email, website, address, doctorName, doctorDegree, doctorSpecialty } });
      // /lab (the parent route) still holds the old loader data with is_profile_complete=false,
      // which would bounce the user straight back here. Refresh it before leaving.
      await router.invalidate();
      await navigate({ to: "/lab" });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      setError(
        msg === "OWNER_ACCESS_REQUIRED"
          ? "الحفظ متاح لصاحب المعمل فقط."
          : msg === "LAB_ACCESS_REQUIRED"
            ? "الحساب غير مرتبط بمعمل نشط."
            : msg || "تعذر حفظ بيانات المعمل",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="min-h-screen bg-paper px-4 py-8 sm:px-6">
      <div className="mx-auto max-w-3xl">
        <section className="overflow-hidden rounded-2xl bg-ink p-6 text-paper sm:p-9">
          <div className="flex items-start gap-4">
            <div className="grid size-12 shrink-0 place-items-center rounded-xl bg-teal text-teal-fg"><Building2 className="size-6" /></div>
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-paper/55">Microscopic System</p>
              <h1 className="mt-2 font-display text-3xl font-semibold">أهلاً بيكم في Microscopic System 👋</h1>
              <p className="mt-3 max-w-2xl text-sm leading-7 text-paper/70">دي أول خطوة في تشغيل معملك. اكتب بيانات المعمل مرة واحدة، وهتظهر بعد كده تلقائيًا في لوحة التحكم والتقارير المطبوعة.</p>
            </div>
          </div>
        </section>

        <form onSubmit={save} noValidate className="mt-6 app-card p-5 sm:p-7">
          <div className="mb-6 grid gap-3 sm:grid-cols-3">
            <Step icon={<Building2 className="size-4" />} title="بيانات المعمل" active />
            <Step icon={<Phone className="size-4" />} title="بيانات التواصل" active />
            <Step icon={<UserRound className="size-4" />} title="المسؤول" active />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="اسم المعمل *" value={name} onChange={setName} required placeholder="معمل النور للتحاليل الطبية" />
            <Field label="الاسم بالإنجليزية" value={nameEn} onChange={setNameEn} dir="ltr" placeholder="Al Noor Medical Laboratory" />
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field label="رقم الهاتف *" value={phone} onChange={setPhone} required dir="ltr" placeholder="01xxxxxxxxx" />
            <Field label="واتساب" value={whatsapp} onChange={setWhatsapp} dir="ltr" placeholder="01xxxxxxxxx" />
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field label="البريد الإلكتروني" value={email} onChange={setEmail} dir="ltr" placeholder="lab@example.com" />
            <Field label="الموقع الإلكتروني" value={website} onChange={setWebsite} dir="ltr" placeholder="www.example.com" />
          </div>
          <div className="mt-4">
            <Label>العنوان بالتفصيل *</Label>
            <Textarea value={address} onChange={(e) => setAddress(e.target.value)} required placeholder="المحافظة، المدينة، الشارع، رقم العقار..." />
          </div>
          <div className="mt-6 flex items-center gap-2 border-t border-line pt-6 text-sm font-medium"><UserRound className="size-4 text-teal" /> بيانات الطبيب / المسؤول</div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field label="اسم الطبيب أو المسؤول" value={doctorName} onChange={setDoctorName} placeholder="د. أحمد محمد" />
            <Field label="الدرجة العلمية" value={doctorDegree} onChange={setDoctorDegree} placeholder="ماجستير / دكتوراه" />
          </div>
          <div className="mt-4"><Field label="التخصص" value={doctorSpecialty} onChange={setDoctorSpecialty} placeholder="كيمياء حيوية / باثولوجيا إكلينيكية" /></div>

          {error ? <p className="mt-4 rounded-lg border border-high/20 bg-high/5 px-3 py-2 text-sm text-high">{error}</p> : null}
          <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-muted">* الاسم والهاتف والعنوان بيانات أساسية لتفعيل ملف المعمل.</p>
            <Button type="submit" size="lg" disabled={saving}>{saving ? "جارٍ حفظ البيانات…" : "حفظ وتشغيل المعمل"}</Button>
          </div>
        </form>
      </div>
    </main>
  );
}

function Step({ icon, title, active }: { icon: React.ReactNode; title: string; active: boolean }) {
  return <div className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${active ? "border-teal/30 bg-teal/5 text-teal" : "border-line text-muted"}`}>{icon}{title}</div>;
}

function Field({ label, value, onChange, required, placeholder, dir }: { label: string; value: string; onChange: (v: string) => void; required?: boolean; placeholder?: string; dir?: "ltr" | "rtl" }) {
  return <div className="space-y-1.5"><Label>{label}</Label><Input value={value} onChange={(e) => onChange(e.target.value)} required={required} placeholder={placeholder} dir={dir} /></div>;
}
