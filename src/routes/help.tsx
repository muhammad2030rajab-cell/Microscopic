import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { ArrowRight, FileText, FlaskConical, Settings2, ShieldCheck, Mail } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { getCurrentLab, type LabProfileData } from "@/lib/lab-access";

export const Route = createFileRoute("/help")({
  loader: async () => {
    try {
      return { lab: await getCurrentLab() };
    } catch {
      return { lab: null as LabProfileData | null };
    }
  },
  component: HelpPage,
});

function HelpPage() {
  const { lab } = Route.useLoaderData();
  if (!lab) return <Navigate to="/login" replace />;
  return (
    <AppShell lab={{ name: lab.lab_name, nameEn: lab.lab_name_en, doctorName: lab.doctor_name, doctorSpecialty: lab.doctor_specialty }}>
      <header className="mb-5 flex items-center justify-between">
        <div><p className="text-xs uppercase tracking-[0.18em] text-muted">Help center</p><h1 className="mt-1 font-display text-2xl font-semibold sm:text-3xl">مساعدة ❓</h1></div>
        <Link to="/lab" className="inline-flex items-center gap-2 text-sm text-teal hover:underline"><ArrowRight className="size-4" /> لوحة المعمل</Link>
      </header>

      <div className="space-y-3">
        <HelpCard icon={<FlaskConical />} title="كيفية إنشاء تقرير جديد">
          من الشاشة الرئيسية اضغط «تقرير جديد» ← اختر التحاليل المطلوبة ← أدخل بيانات المريض وتاريخ سحب العينة ← أدخل النتائج ← عاين التقرير واحفظه أو أرسله للمراجعة.
        </HelpCard>
        <HelpCard icon={<FileText />} title="مشاركة التقرير وطباعته">
          من صفحة التقرير تقدر تحفظه PDF، تطبعه مباشرة، أو ترسل ملخص نتائجه عبر واتساب أو البريد الإلكتروني.
        </HelpCard>
        <HelpCard icon={<ShieldCheck />} title="الصلاحيات وفريق العمل">
          كل موظف في المعمل له صلاحيات محددة (مشاهدة، إنشاء، تعديل، حذف، اعتماد). يقدر مالك المعمل يدير الفريق من صفحة «الفريق» ويحدد صلاحية كل شخص بدقة.
        </HelpCard>
        <HelpCard icon={<Settings2 />} title="بيانات المعمل والشعار">
          من «الإعدادات» تقدر ترفع شعار معملك وتضيف بيانات التواصل (هاتف، واتساب، بريد) — هتظهر تلقائيًا في كل تقرير تطبعه.
        </HelpCard>
        <HelpCard icon={<Mail />} title="تواصل معنا">
          لأي استفسار أو مشكلة تقنية راسلنا على support@rajab-diagnostics.app
        </HelpCard>
      </div>
    </AppShell>
  );
}

function HelpCard({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-line bg-elevated p-5">
      <div className="flex items-center gap-3">
        <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-teal/10 text-teal">{icon}</div>
        <b className="text-[15px]">{title}</b>
      </div>
      <p className="mt-2 text-[13.5px] leading-7 text-muted">{children}</p>
    </div>
  );
}
