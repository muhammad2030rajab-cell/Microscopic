import { useEffect, useRef, useState, type ReactNode } from "react";
import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { ArrowDown, ArrowRight, ArrowUp, CheckCircle2, ChevronDown, ClipboardCheck, FileDown, Loader2, Mail, MessageCircle, Minus, Pencil, Printer, Send, Trash2, TriangleAlert } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { PrintView } from "@/components/report/print-view";
import { Button } from "@/components/ui/button";
import { interpretResult, isCritical, parseValue } from "@/lib/medical";
import { approveLabReport, deleteLabReport, getLabReport, getPreviousResults, submitLabReportForReview, type PreviousResults } from "@/lib/lab-reports";
import { getCurrentLab, type LabProfileData } from "@/lib/lab-access";
import { getCurrentLabPermissions } from "@/lib/lab-users";
import { useNavigate } from "@tanstack/react-router";
import { reportStatusClasses, reportStatusLabels } from "@/lib/report-workflow";
import { downloadReportPdf } from "@/lib/generate-report-pdf";
import { formatSlashDate, visitIdFrom } from "@/lib/utils";
import { listReportAttachments, type ReportAttachment } from "@/lib/attachments";
import { AttachmentsPanel } from "@/components/report/attachments-panel";
import { ShareDialog, type ShareChannel } from "@/components/report/share-dialog";
import { ageToYears, formatAge } from "@/lib/age";
import { REPORT_LANGS, isReportLang, type ReportLang } from "@/lib/report-strings";

export const Route = createFileRoute("/reports/$id")({
  loader: async ({ params }) => {
    try {
      const [report, lab, access] = await Promise.all([getLabReport({ data: { id: params.id } }), getCurrentLab(), getCurrentLabPermissions()]);
      const attachments = await listReportAttachments({ data: { reportId: params.id } }).catch(() => [] as ReportAttachment[]);
      const previous = await getPreviousResults({ data: { reportId: params.id } }).catch(() => null as PreviousResults | null);
      return { report, lab, permissions: access.permissions, attachments, previous };
    } catch {
      return { report: null, lab: null as LabProfileData | null, permissions: {} as Record<string, boolean | undefined>, attachments: [] as ReportAttachment[], previous: null as PreviousResults | null };
    }
  },
  component: ReportDetail,
});

function ReportDetail() {
  const data = Route.useLoaderData();
  const { lab, permissions, attachments, previous } = data;
  const navigate = useNavigate();
  const [report, setReport] = useState(data.report);
  const [loading, setLoading] = useState<"submit" | "approve" | "delete" | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [error, setError] = useState("");
  const [shareChannel, setShareChannel] = useState<ShareChannel | null>(null);
  const [lang, setLang] = useState<ReportLang>("bi");

  // Remembered per device. Read after mount so server and client HTML match.
  useEffect(() => {
    try {
      const saved = localStorage.getItem("rajab:report-lang");
      if (isReportLang(saved)) setLang(saved);
    } catch { /* storage blocked: keep the default */ }
  }, []);

  function chooseLang(next: ReportLang) {
    setLang(next);
    try { localStorage.setItem("rajab:report-lang", next); } catch { /* ignore */ }
  }
  const printRef = useRef<HTMLDivElement>(null);

  if (!lab) return <Navigate to="/login" replace />;
  if (!report) return <AppShell><div className="mx-auto max-w-lg py-16 text-center"><h1 className="font-display text-2xl font-semibold">التقرير غير موجود</h1><Link to="/reports" className="mt-6 inline-flex text-sm text-teal hover:underline">العودة للأرشيف</Link></div></AppShell>;

  const notes = report.tests.map((t) => ({ t, f: interpretResult(t.name, t.value, report.gender, t.customRange, ageToYears(report.age, report.ageUnit), t.categoryId) })).filter(({ f }) => f.flag !== "normal" && f.flag !== "unknown");
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
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm text-ink-soft" id="report-lang-label">لغة التقرير (للطباعة وPDF)</span>
              <div role="radiogroup" aria-labelledby="report-lang-label" className="inline-flex overflow-hidden rounded-md border border-line">
                {REPORT_LANGS.map((l) => (
                  <button
                    key={l.value}
                    type="button"
                    role="radio"
                    aria-checked={lang === l.value}
                    onClick={() => chooseLang(l.value)}
                    className={`min-h-11 px-4 text-sm transition-colors ${lang === l.value ? "bg-ink text-paper" : "bg-elevated text-ink hover:bg-paper-2"}`}
                  >
                    {l.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-4 gap-2">
              <ShareAction icon={pdfLoading ? <Loader2 className="size-5 animate-spin" /> : <FileDown className="size-5" />} label={pdfLoading ? "جارٍ الإنشاء…" : "حفظ PDF"} color="bg-red-500/10 text-red-600" onClick={downloadPdf} disabled={pdfLoading} />
              <ShareAction icon={<Printer className="size-5" />} label="طباعة" color="bg-slate-500/10 text-slate-600" onClick={() => window.print()} />
              <ShareAction icon={<MessageCircle className="size-5" />} label="واتساب" color="bg-emerald-500/10 text-emerald-600" onClick={() => setShareChannel("whatsapp")} />
              <ShareAction icon={<Mail className="size-5" />} label="بريد" color="bg-teal/10 text-teal" onClick={() => setShareChannel("email")} />
            </div>
            <p className="mt-2.5 px-1 text-xs leading-5 text-muted">واتساب والبريد بيبعتوا رابط تحقق (أو ملخص نصي بعد تأكيدك). لإرسال التقرير بشكله الكامل استخدم "حفظ PDF" وأرفق الملف يدويًا.</p>
          </section>

          <AttachmentsPanel reportId={report.id} canEdit={permissions["reports.edit"] === true} initial={attachments} />

          {previous ? <section className="mb-4 rounded-lg border border-line bg-elevated p-4 print:hidden">
            <p className="text-sm font-medium">مقارنة بالزيارة السابقة</p>
            <p className="mt-0.5 text-xs text-muted">آخر تقرير معتمد بتاريخ {formatSlashDate(previous.reportDate)}</p>
            <ul className="mt-3 divide-y divide-line/60">
              {report.tests.filter((t) => t.value && previous.values[`${t.categoryId}:${t.name}`]).map((t) => {
                const before = previous.values[`${t.categoryId}:${t.name}`];
                const curNum = parseValue(t.value);
                const prevNum = parseValue(before);
                let trend: "up" | "down" | "same" | null = null;
                if (curNum != null && prevNum != null) trend = curNum > prevNum ? "up" : curNum < prevNum ? "down" : "same";
                return (
                  <li key={`${t.categoryId}-${t.name}`} className="flex items-center justify-between gap-3 py-2 text-sm">
                    <span className="text-ink-soft">{t.name}</span>
                    <span className="flex items-center gap-2 tabular-nums">
                      <span className="text-xs text-muted">{before}</span>
                      {trend === "up" ? <ArrowUp className="size-3.5 text-high" aria-label="ارتفع" /> : trend === "down" ? <ArrowDown className="size-3.5 text-teal" aria-label="انخفض" /> : trend === "same" ? <Minus className="size-3.5 text-muted" aria-label="بدون تغيير" /> : null}
                      <span className="font-medium">{t.value}</span>
                    </span>
                  </li>
                );
              })}
            </ul>
          </section> : null}

          {notes.length > 0 ? <details className="group mb-5 rounded-lg border border-line bg-elevated">
            <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 text-sm font-medium">
              <span>ملخص طبي <span className="ms-1 rounded-full bg-paper-2 px-2 py-0.5 text-xs text-ink-soft">{notes.length}</span></span>
              <ChevronDown className="size-4 text-muted transition-transform group-open:rotate-180" />
            </summary>
            <ul className="space-y-1.5 border-t border-line px-4 py-3 text-sm text-ink-soft">{notes.map(({ f, t }) => <li key={`${t.categoryId}-${t.name}`}><span className="font-medium text-ink">{t.name}:</span> {f.note}</li>)}</ul>
          </details> : null}
        </div>

        <div ref={printRef} className="mx-auto w-full max-w-4xl">
          <PrintView report={report} lab={labProfile} lang={lang} interactive />
        </div>
      </AppShell>
    </div>
    <ShareDialog
      channel={shareChannel}
      onClose={() => setShareChannel(null)}
      input={{
        labName: labProfile.name,
        patientName: report.patientName,
        age: formatAge("ar", report.age, report.ageUnit),
        gender: report.gender,
        doctor: report.doctor,
        tests: report.tests,
        critical,
        verifyUrl: `${typeof window === "undefined" ? "" : window.location.origin}/verify/${report.id}`,
        approved: report.status === "approved",
      }}
    />
    <div className="hidden print:block"><PrintView report={report} lab={labProfile} lang={lang} /></div>
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
