import { useRef, useState, type ReactNode } from "react";
import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { ArrowRight, CheckCircle2, ClipboardCheck, FileDown, Loader2, Mail, MessageCircle, Pencil, Printer, Send, Trash2 } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { PrintView } from "@/components/report/print-view";
import { Button } from "@/components/ui/button";
import { interpretResult, isCritical } from "@/lib/medical";
import { approveLabReport, deleteLabReport, getLabReport, submitLabReportForReview } from "@/lib/lab-reports";
import { getCurrentLab, type LabProfileData } from "@/lib/lab-access";
import { getCurrentLabPermissions } from "@/lib/lab-users";
import { useNavigate } from "@tanstack/react-router";
import { reportStatusClasses, reportStatusLabels } from "@/lib/report-workflow";
import { downloadReportPdf } from "@/lib/generate-report-pdf";
import { visitIdFrom } from "@/lib/utils";

export const Route = createFileRoute("/reports/$id")({
  loader: async ({ params }) => {
    try {
      const [report, lab, access] = await Promise.all([getLabReport({ data: { id: params.id } }), getCurrentLab(), getCurrentLabPermissions()]);
      return { report, lab, permissions: access.permissions };
    } catch {
      return { report: null, lab: null as LabProfileData | null, permissions: {} as Record<string, boolean | undefined> };
    }
  },
  component: ReportDetail,
});

function ReportDetail() {
  const data = Route.useLoaderData();
  const { lab, permissions } = data;
  const navigate = useNavigate();
  const [report, setReport] = useState(data.report);
  const [loading, setLoading] = useState<"submit" | "approve" | "delete" | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [error, setError] = useState("");
  const printRef = useRef<HTMLDivElement>(null);

  if (!lab) return <Navigate to="/login" replace />;
  if (!report) return <AppShell><div className="mx-auto max-w-lg py-16 text-center"><h1 className="font-display text-2xl font-semibold">التقرير غير موجود</h1><Link to="/reports" className="mt-6 inline-flex text-sm text-teal hover:underline">العودة للأرشيف</Link></div></AppShell>;

  const notes = report.tests.map((t) => ({ t, f: interpretResult(t.name, t.value, report.gender, t.customRange) })).filter(({ f }) => f.flag !== "normal" && f.flag !== "unknown");
  const critical = report.tests.filter((t) => isCritical(t.name, t.value));
  const labProfile = {
    name: lab.lab_name,
    nameEn: lab.lab_name_en || lab.lab_name,
    phone: lab.phone || "",
    address: lab.address || "",
    email: lab.email || "",
    website: lab.website || "",
    doctorName: lab.doctor_name || "",
    doctorDegree: lab.doctor_degree || "",
    doctorSpecialty: lab.doctor_specialty || "",
    logoUrl: lab.logo_url || "",
  };

  async function submitForReview() {
    setError(""); setLoading("submit");
    try {
      const result = await submitLabReportForReview({ data: { id: report.id } });
      setReport({ ...report, status: result.status });
    } catch (err) { setError(err instanceof Error ? err.message : "تعذر إرسال التقرير للمراجعة"); }
    finally { setLoading(null); }
  }

  async function approve() {
    setError(""); setLoading("approve");
    try {
      const result = await approveLabReport({ data: { id: report.id } });
      setReport({ ...report, status: result.status, approvedAt: new Date().toISOString() });
    } catch (err) { setError(err instanceof Error ? err.message : "تعذر اعتماد التقرير"); }
    finally { setLoading(null); }
  }

  async function remove() {
    if (!window.confirm("هل أنت متأكد من حذف هذا التقرير؟ لا يمكن التراجع عن هذا الإجراء.")) return;
    setError(""); setLoading("delete");
    try {
      await deleteLabReport({ data: { id: report.id } });
      navigate({ to: "/reports" });
    } catch (err) { setError(err instanceof Error ? err.message : "تعذر حذف التقرير"); setLoading(null); }
  }

  async function downloadPdf() {
    if (!printRef.current) return;
    setError("");
    setPdfLoading(true);
    try {
      const visit = visitIdFrom(report.id);
      await downloadReportPdf(printRef.current, `تقرير-${report.patientName}-${visit}.pdf`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذر إنشاء ملف PDF");
    } finally {
      setPdfLoading(false);
    }
  }

  const canSubmit = permissions["reports.edit"] === true && report.status === "draft";
  const canApprove = permissions["reports.approve"] === true && ["draft", "pending_review"].includes(report.status);
  const canDelete = permissions["reports.delete"] === true && report.status !== "approved";

  function shareSummaryText() {
    const lines = [
      `تقرير تحليل — ${labProfile.name}`,
      `المريض: ${report.patientName} (${report.age} ${report.gender})`,
      report.doctor ? `الطبيب المحيل: ${report.doctor}` : null,
      "",
      ...report.tests.map((t) => `${t.name}: ${t.value} ${t.unit}`),
      critical.length ? `\n⚠️ قيم حرجة: ${critical.map((t) => `${t.name} (${t.value})`).join("، ")}` : null,
    ].filter(Boolean);
    return lines.join("\n");
  }

  function shareOnWhatsapp() {
    const text = encodeURIComponent(shareSummaryText());
    window.open(`https://wa.me/?text=${text}`, "_blank", "noopener,noreferrer");
  }

  function shareByEmail() {
    const subject = encodeURIComponent(`تقرير تحليل — ${report.patientName}`);
    const body = encodeURIComponent(shareSummaryText());
    window.location.href = `mailto:?subject=${subject}&body=${body}`;
  }

  return <div className="print-root min-h-dvh bg-paper">
    <div className="no-print">
      <AppShell>
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <Link to="/reports" className="inline-flex h-11 items-center gap-2 text-sm text-ink-soft"><ArrowRight className="size-4" />الأرشيف</Link>
          <div className="flex flex-wrap items-center gap-2">
            {report.status === "draft" ? <Button variant="secondary" asChild><Link to="/reports/edit/$id" params={{ id: report.id }}><Pencil className="size-4" />تعديل المسودة</Link></Button> : null}
            {canSubmit ? <Button variant="secondary" onClick={submitForReview} disabled={loading !== null}><Send className="size-4" />{loading === "submit" ? "جارٍ الإرسال…" : "إرسال للمراجعة"}</Button> : null}
            {canApprove ? <Button onClick={approve} disabled={loading !== null}><ClipboardCheck className="size-4" />{loading === "approve" ? "جارٍ الاعتماد…" : "اعتماد التقرير"}</Button> : null}
            {canDelete ? <Button variant="danger" onClick={remove} disabled={loading !== null}><Trash2 className="size-4" />{loading === "delete" ? "جارٍ الحذف…" : "حذف التقرير"}</Button> : null}
          </div>
        </div>

        <div className="mx-auto mb-5 flex max-w-[820px] flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-elevated p-4">
          <div><p className="text-xs text-muted">حالة التقرير</p><span className={`mt-1 inline-flex rounded-full px-3 py-1 text-xs ${reportStatusClasses[report.status]}`}>{reportStatusLabels[report.status]}</span></div>
          {report.status === "pending_review" ? <p className="text-sm text-high">التقرير في انتظار مراجعة واعتماد المسؤول.</p> : null}
          {report.status === "approved" ? <p className="inline-flex items-center gap-1.5 text-sm text-ok"><CheckCircle2 className="size-4" />التقرير معتمد وجاهز كنسخة نهائية.</p> : null}
          {report.status === "draft" ? <p className="text-sm text-muted">يمكن تعديل مسار التقرير ثم إرساله للمراجعة.</p> : null}
        </div>

        <div className="mx-auto mb-5 max-w-[820px] rounded-lg border border-line bg-elevated p-4">
          <p className="mb-3 text-sm font-medium">مشاركة التقرير</p>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            <ShareAction icon={pdfLoading ? <Loader2 className="size-5 animate-spin" /> : <FileDown className="size-5" />} label={pdfLoading ? "جارٍ الإنشاء…" : "حفظ PDF"} color="bg-red-500/10 text-red-600" onClick={downloadPdf} disabled={pdfLoading} />
            <ShareAction icon={<MessageCircle className="size-5" />} label="واتساب" color="bg-emerald-500/10 text-emerald-600" onClick={shareOnWhatsapp} />
            <ShareAction icon={<Mail className="size-5" />} label="بريد إلكتروني" color="bg-teal/10 text-teal" onClick={shareByEmail} />
            <ShareAction icon={<Printer className="size-5" />} label="طباعة" color="bg-slate-500/10 text-slate-600" onClick={() => window.print()} />
          </div>
          <p className="mt-3 text-xs leading-5 text-muted">مشاركة واتساب والبريد بترسل ملخص نتائج التقرير كنص. لإرسال التقرير بشكله الكامل (PDF)، استخدم زر "حفظ PDF" ثم أرفق الملف يدويًا.</p>
        </div>
        {error ? <div className="mx-auto mb-5 max-w-[820px] rounded-lg border border-high/20 bg-high/5 p-4 text-sm text-high">{error}</div> : null}

        {(critical.length || notes.length) ? <aside className="mx-auto mb-6 w-full max-w-[820px] rounded-lg border border-line bg-elevated p-4"><h2 className="text-sm font-medium">ملخص طبي</h2>{critical.length > 0 && <p className="mt-2 text-sm text-high">قيم حرجة: {critical.map((t) => `${t.name} (${t.value})`).join("، ")}</p>}<ul className="mt-2 space-y-1.5 text-sm text-ink-soft">{notes.slice(0, 6).map(({ f, t }) => <li key={`${t.categoryId}-${t.name}`}><span className="font-medium text-ink">{t.name}:</span> {f.note}</li>)}</ul></aside> : null}
        <div ref={printRef} className="mx-auto w-full max-w-4xl">
          <PrintView report={report} lab={labProfile} interactive />
        </div>
      </AppShell>
    </div>
    <div className="hidden print:block"><PrintView report={report} lab={labProfile} /></div>
  </div>;
}

function ShareAction({
  icon,
  label,
  color,
  onClick,
  disabled,
}: {
  icon: ReactNode;
  label: string;
  color: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex flex-col items-center gap-2 rounded-lg border border-line bg-elevated p-3 text-center transition hover:-translate-y-0.5 hover:shadow-sm disabled:pointer-events-none disabled:opacity-60"
    >
      <span className={`grid size-10 place-items-center rounded-full ${color}`}>{icon}</span>
      <span className="text-xs font-medium">{label}</span>
    </button>
  );
}
