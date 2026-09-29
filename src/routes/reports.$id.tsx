import { useRef, useState, type ReactNode } from "react";
import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { ArrowRight, CheckCircle2, ChevronDown, ClipboardCheck, FileDown, Loader2, Mail, MessageCircle, Pencil, Printer, Send, Trash2, TriangleAlert } from "lucide-react";
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
import { listReportAttachments, type ReportAttachment } from "@/lib/attachments";
import { AttachmentsPanel } from "@/components/report/attachments-panel";

export const Route = createFileRoute("/reports/$id")({
  loader: async ({ params }) => {
    try {
      const [report, lab, access] = await Promise.all([getLabReport({ data: { id: params.id } }), getCurrentLab(), getCurrentLabPermissions()]);
      const attachments = await listReportAttachments({ data: { reportId: params.id } }).catch(() => [] as ReportAttachment[]);
      return { report, lab, permissions: access.permissions, attachments };
    } catch {
      return { report: null, lab: null as LabProfileData | null, permissions: {} as Record<string, boolean | undefined>, attachments: [] as ReportAttachment[] };
    }
  },
  component: ReportDetail,
});

function ReportDetail() {
  const data = Route.useLoaderData();
  const { lab, permissions, attachments } = data;
  const navigate = useNavigate();
  const [report, setReport] = useState(data.report);
  const [loading, setLoading] = useState<"submit" | "approve" | "delete" | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [error, setError] = useState("");
  const printRef = useRef<HTMLDivElement>(null);

  if (!lab) return <Navigate to="/login" replace />;
  if (!report) return <AppShell><div className="mx-auto max-w-lg py-16 text-center"><h1 className="font-display text-2xl font-semibold">التقرير غير موجود</h1><Link to="/reports" className="mt-6 inline-flex text-sm text-teal hover:underline">العودة للأرشيف</Link></div></AppShell>;

  const notes = report.tests.map((t) => ({ t, f: interpretResult(t.name, t.value, report.gender, t.customRange, t.categoryId) })).filter(({ f }) => f.flag !== "normal" && f.flag !== "unknown");
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

  const visit = visitIdFrom(report.id);

  return <div className="print-root min-h-dvh bg-paper">
    <div className="no-print">
      <AppShell>
        <div className="mx-auto w-full max-w-4xl">
          <Link to="/reports" className="mb-3 inline-flex h-11 items-center gap-2 text-sm text-ink-soft"><ArrowRight className="size-4" />الأرشيف</Link>

          <section className="mb-4 rounded-lg border border-line bg-elevated p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h1 className="font-display text-xl font-semibold leading-tight">{report.patientName}</h1>
                <p dir="ltr" className="mt-0.5 text-start font-mono text-xs text-muted">{visit}</p>
              </div>
              <span className={`inline-flex rounded-full px-3 py-1 text-xs ${reportStatusClasses[report.status]}`}>{reportStatusLabels[report.status]}</span>
            </div>
            {report.status === "pending_review" ? <p className="mt-3 text-sm text-high">التقرير في انتظار مراجعة واعتماد المسؤول.</p> : null}
            {report.status === "approved" ? <p className="mt-3 inline-flex items-center gap-1.5 text-sm text-ok"><CheckCircle2 className="size-4" />التقرير معتمد وجاهز كنسخة نهائية.</p> : null}
            {report.status === "draft" ? <p className="mt-3 text-sm text-muted">يمكن تعديل التقرير ثم إرساله للمراجعة.</p> : null}
            <div className="mt-4 flex flex-wrap items-center gap-2">
              {canApprove ? <Button onClick={approve} disabled={loading !== null}><ClipboardCheck className="size-4" />{loading === "approve" ? "جارٍ الاعتماد…" : "اعتماد التقرير"}</Button> : null}
              {canSubmit ? <Button variant="secondary" onClick={submitForReview} disabled={loading !== null}><Send className="size-4" />{loading === "submit" ? "جارٍ الإرسال…" : "إرسال للمراجعة"}</Button> : null}
              {report.status === "draft" ? <Button variant="secondary" asChild><Link to="/reports/edit/$id" params={{ id: report.id }}><Pencil className="size-4" />تعديل المسودة</Link></Button> : null}
              {canDelete ? <Button variant="danger" onClick={remove} disabled={loading !== null}><Trash2 className="size-4" />{loading === "delete" ? "جارٍ الحذف…" : "حذف التقرير"}</Button> : null}
            </div>
          </section>

          {critical.length > 0 ? <div role="alert" className="mb-4 flex items-start gap-2 rounded-lg border border-high/30 bg-high-bg p-4 text-sm text-high"><TriangleAlert className="mt-0.5 size-4 shrink-0" /><p><span className="font-semibold">قيم حرجة: </span>{critical.map((t) => `${t.name} (${t.value})`).join("، ")}</p></div> : null}

          {error ? <div role="alert" className="mb-4 rounded-lg border border-high/20 bg-high/5 p-4 text-sm text-high">{error}</div> : null}

          <section className="mb-4 rounded-lg border border-line bg-elevated p-3">
            <div className="grid grid-cols-4 gap-2">
              <ShareAction icon={pdfLoading ? <Loader2 className="size-5 animate-spin" /> : <FileDown className="size-5" />} label={pdfLoading ? "جارٍ الإنشاء…" : "حفظ PDF"} color="bg-red-500/10 text-red-600" onClick={downloadPdf} disabled={pdfLoading} />
              <ShareAction icon={<Printer className="size-5" />} label="طباعة" color="bg-slate-500/10 text-slate-600" onClick={() => window.print()} />
              <ShareAction icon={<MessageCircle className="size-5" />} label="واتساب" color="bg-emerald-500/10 text-emerald-600" onClick={shareOnWhatsapp} />
              <ShareAction icon={<Mail className="size-5" />} label="بريد" color="bg-teal/10 text-teal" onClick={shareByEmail} />
            </div>
            <p className="mt-2.5 px-1 text-xs leading-5 text-muted">واتساب والبريد بيرسلوا ملخص النتائج كنص فقط. لإرسال التقرير بشكله الكامل استخدم "حفظ PDF" وأرفق الملف يدويًا.</p>
          </section>

          <AttachmentsPanel reportId={report.id} canEdit={permissions["reports.edit"] === true} initial={attachments} />

          {notes.length > 0 ? <details className="group mb-5 rounded-lg border border-line bg-elevated">
            <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 text-sm font-medium">
              <span>ملخص طبي <span className="ms-1 rounded-full bg-paper-2 px-2 py-0.5 text-xs text-ink-soft">{notes.length}</span></span>
              <ChevronDown className="size-4 text-muted transition-transform group-open:rotate-180" />
            </summary>
            <ul className="space-y-1.5 border-t border-line px-4 py-3 text-sm text-ink-soft">{notes.map(({ f, t }) => <li key={`${t.categoryId}-${t.name}`}><span className="font-medium text-ink">{t.name}:</span> {f.note}</li>)}</ul>
          </details> : null}
        </div>

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
      className="flex min-h-16 flex-col items-center justify-center gap-1.5 rounded-lg border border-line bg-elevated p-2 text-center transition hover:bg-paper disabled:pointer-events-none disabled:opacity-60"
    >
      <span className={`grid size-9 place-items-center rounded-full ${color}`}>{icon}</span>
      <span className="text-xs font-medium">{label}</span>
    </button>
  );
}
