import { useEffect, useRef, useState, type ReactNode } from "react";
import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { ArrowDown, ArrowRight, ArrowUp, CheckCircle2, ChevronDown, ClipboardCheck, FileDown, Loader2, Mail, MessageCircle, Minus, Pencil, Printer, Send, Share2, Trash2, TriangleAlert } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { ReportSheet } from "@/components/report/report-sheet";
import { Button } from "@/components/ui/button";
import { interpretResult, isCritical, parseValue } from "@/lib/medical";
import { approveLabReport, deleteLabReport, getLabReport, getPreviousResults, submitLabReportForReview, type PreviousResults } from "@/lib/lab-reports";
import { getCurrentLab, type LabProfileData } from "@/lib/lab-access";
import { getCurrentLabPermissions } from "@/lib/lab-users";
import { loadLocalReport } from "@/lib/sync-engine/offline-fallback";
import { useNavigate } from "@tanstack/react-router";
import { reportStatusClasses, reportStatusLabels } from "@/lib/report-workflow";
import { buildReportPdf, downloadReportPdf } from "@/lib/generate-report-pdf";
import { formatSlashDate, visitIdFrom } from "@/lib/utils";
import { listReportAttachments, type ReportAttachment } from "@/lib/attachments";
import { AttachmentsPanel } from "@/components/report/attachments-panel";
import { getReportDesignAssets } from "@/lib/report-design-settings";
import { normalizeDesign, normalizeAsset, isReportTemplate, REPORT_TEMPLATES, type ReportDesignAssets, type ReportTemplate } from "@/lib/report-design";
import { ShareDialog, type ShareChannel } from "@/components/report/share-dialog";
import { PdfShareDialog } from "@/components/report/pdf-share-dialog";
import { toWhatsAppNumber } from "@/lib/phone";
import { ageToYears, formatAge } from "@/lib/age";
import { REPORT_LANGS, type ReportLang } from "@/lib/report-strings";
import { CLINICAL_FLAGS, SAMPLE_TYPES, normalizeIntake } from "@/lib/report-intake";
import { InvoiceCard } from "@/components/report/invoice-card";

export const Route = createFileRoute("/reports/$id")({
  loader: async ({ params }) => {
    try {
      const [report, lab, access] = await Promise.all([getLabReport({ data: { id: params.id } }), getCurrentLab(), getCurrentLabPermissions()]);
      const attachments = await listReportAttachments({ data: { reportId: params.id } }).catch(() => [] as ReportAttachment[]);
      const previous = await getPreviousResults({ data: { reportId: params.id } }).catch(() => null as PreviousResults | null);
      return { report, lab, permissions: access.permissions, role: access.role as string, attachments, previous, offline: false, pendingEdit: false };
    } catch (err) {
      // No connection: show the copy kept on this device. Read-only — no permissions, so no action buttons.
      const local = await loadLocalReport<LabProfileData>(err, params.id);
      if (local) {
        return {
          report: local.report as Awaited<ReturnType<typeof getLabReport>>,
          lab: local.lab as LabProfileData | null,
          permissions: {} as Record<string, boolean | undefined>,
          role: "" as string,
          attachments: [] as ReportAttachment[],
          previous: null as PreviousResults | null,
          offline: true,
          pendingEdit: local.pendingEdit,
        };
      }
      return { offline: false, pendingEdit: false, report: null, lab: null as LabProfileData | null, permissions: {} as Record<string, boolean | undefined>, role: "" as string, attachments: [] as ReportAttachment[], previous: null as PreviousResults | null };
    }
  },
  component: ReportDetail,
});

function ReportDetail() {
  const data = Route.useLoaderData();
  const { lab, permissions, role, attachments, previous, offline, pendingEdit } = data;
  const navigate = useNavigate();
  const [report, setReport] = useState(data.report);
  const [loading, setLoading] = useState<"submit" | "approve" | "delete" | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [error, setError] = useState("");
  const [shareChannel, setShareChannel] = useState<ShareChannel | null>(null);
  const [pdfShareOpen, setPdfShareOpen] = useState(false);
  // null = follow the lab's setting; a choice made on this device overrides it.
  const [langChoice, setLangChoice] = useState<ReportLang | null>(null);
  // "" = the lab's own template; a choice made on this device overrides it for printing.
  const [templateChoice, setTemplateChoice] = useState<ReportTemplate | "">("");

  // Remembered per device. Read after mount so server and client HTML match.
  useEffect(() => {
    try {
      // The report language is the lab's setting now. An old per-device choice used to stick here and
      // kept showing Arabic after the lab switched to English, so it is dropped.
      localStorage.removeItem("rajab:report-lang");
      const savedTemplate = localStorage.getItem("rajab:report-template");
      if (isReportTemplate(savedTemplate)) setTemplateChoice(savedTemplate);
    } catch { /* storage blocked: keep the default */ }
  }, []);

  function chooseLang(next: ReportLang) {
    setLangChoice(next); // only for this view / print / PDF; the default is set in Settings
  }
  function chooseTemplate(next: ReportTemplate | "") {
    setTemplateChoice(next);
    try { if (next) localStorage.setItem("rajab:report-template", next); else localStorage.removeItem("rajab:report-template"); } catch { /* ignore */ }
  }
  const printRef = useRef<HTMLDivElement>(null);
  // Signature + stamp are fetched separately (kept out of the lab payload that every page loads) and
  // cached on this device, so an offline print still carries them.
  const labIdForAssets = lab?.lab_id ?? "";
  const [assets, setAssets] = useState<ReportDesignAssets>({ signatureUrl: null, stampUrl: null });
  useEffect(() => {
    if (!labIdForAssets) return;
    const key = `rajab:report-assets:${labIdForAssets}`;
    try {
      const cached = JSON.parse(localStorage.getItem(key) ?? "null");
      if (cached) setAssets({ signatureUrl: normalizeAsset(cached.signatureUrl), stampUrl: normalizeAsset(cached.stampUrl) });
    } catch { /* no cache yet */ }
    let cancelled = false;
    getReportDesignAssets()
      .then((fresh) => {
        if (cancelled) return;
        setAssets(fresh);
        try { localStorage.setItem(key, JSON.stringify(fresh)); } catch { /* storage full / private mode */ }
      })
      .catch(() => { /* offline: keep the cached ones */ });
    return () => { cancelled = true; };
  }, [labIdForAssets]);

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
    reportLanguage: (lab.report_language || "bilingual") as "bilingual" | "ar" | "en",
    design: normalizeDesign(lab.report_design),
    assets,
  };

  const lang: ReportLang = langChoice ?? (labProfile.reportLanguage === "ar" ? "ar" : labProfile.reportLanguage === "en" ? "en" : "bi");

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
    const message = report!.status === "approved"
      ? "هذا تقرير معتمد. حذفه نهائي ولا يمكن استرجاعه، وسيُسجَّل في سجل المراجعة. هل تريد المتابعة؟"
      : "هل أنت متأكد من حذف هذا التقرير؟ لا يمكن التراجع عن هذا الإجراء.";
    if (!window.confirm(message)) return;
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
      await downloadReportPdf(printRef.current, pdfFilename);
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذر إنشاء ملف PDF");
    } finally {
      setPdfLoading(false);
    }
  }

  const canSubmit = permissions["reports.edit"] === true && report.status === "draft";
  const canApprove = permissions["reports.approve"] === true && ["draft", "pending_review"].includes(report.status);
  const canDelete = permissions["reports.delete"] === true && (report.status !== "approved" || role === "owner");

  const visit = visitIdFrom(report.id);
  const intakeInfo = (() => {
    const i = normalizeIntake(report.intake);
    const labels = [
      ...(i.vip ? ["VIP"] : []),
      ...(i.takenOutside ? ["العينة اتسحبت خارج المعمل"] : []),
      ...(i.referral ? [`الإحالة: ${i.referral}`] : []),
      ...i.sampleTypes.map((k) => SAMPLE_TYPES.find((x) => x.key === k)?.ar ?? k),
      ...(i.fasting ? [i.fastingHours ? `صائم ${i.fastingHours} ساعة` : "صائم"] : []),
      ...i.flags.map((k) => CLINICAL_FLAGS.find((x) => x.key === k)?.ar ?? k),
    ];
    return labels.length ? labels : null;
  })();
  const pdfFilename = (() => {
    const safeName = report.patientName.replace(/[\\/:*?"<>|\s]+/g, "-").replace(/^-+|-+$/g, "");
    return `${lang === "ar" ? "تقرير" : "Report"}-${visit}${safeName ? `-${safeName}` : ""}.pdf`;
  })();

  return <div className="print-root min-h-dvh bg-paper">
    <div className="no-print">
      <AppShell>
        <div className="mx-auto w-full max-w-4xl">
          {pendingEdit ? <p role="status" className="mb-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">فيه تعديل على التقرير ده محفوظ على جهازك ولسه ما اتبعتش. بيتبعت لوحده لما الاتصال يرجع، والبيانات اللي قدامك فيها التعديل.</p> : null}
          {offline ? <p role="status" className="mb-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">أنت غير متصل. دي نسخة محفوظة على جهازك للعرض والطباعة فقط، ومفيش تعديل أو اعتماد إلا لما الاتصال يرجع.</p> : null}
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
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <label className="text-sm text-ink-soft" htmlFor="report-template">شكل التقرير (للطباعة وPDF)</label>
              <select
                id="report-template"
                value={templateChoice}
                onChange={(e) => chooseTemplate(e.target.value as ReportTemplate | "")}
                className="min-h-11 rounded-md border border-line bg-elevated px-3 text-sm"
              >
                <option value="">الافتراضي للمعمل</option>
                {REPORT_TEMPLATES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
              <ShareAction icon={pdfLoading ? <Loader2 className="size-5 animate-spin" /> : <FileDown className="size-5" />} label={pdfLoading ? "جارٍ الإنشاء…" : "حفظ PDF"} color="bg-red-500/10 text-red-600" onClick={downloadPdf} disabled={pdfLoading} />
              <ShareAction icon={<Printer className="size-5" />} label="طباعة" color="bg-slate-500/10 text-slate-600" onClick={() => window.print()} />
              <ShareAction icon={<Share2 className="size-5" />} label="مشاركة PDF" color="bg-sky-500/10 text-sky-600" onClick={() => setPdfShareOpen(true)} />
              <ShareAction icon={<MessageCircle className="size-5" />} label="واتساب" color="bg-emerald-500/10 text-emerald-600" onClick={() => setShareChannel("whatsapp")} />
              <ShareAction icon={<Mail className="size-5" />} label="بريد" color="bg-teal/10 text-teal" onClick={() => setShareChannel("email")} />
            </div>
            <p className="mt-2.5 px-1 text-xs leading-5 text-muted">واتساب بيفتح محادثة المريض على رقمه المسجّل، ومعاه رابط تحقق (أو ملخص نصي بعد تأكيدك). لإرسال التقرير بشكله الكامل كملف استخدم "مشاركة PDF" واختار واتساب من القائمة.</p>
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

          <InvoiceCard reportId={report.id} />

          {intakeInfo ? <section className="mb-5 rounded-lg border border-line bg-elevated p-4 text-sm">
            <p className="mb-2 text-xs font-medium text-ink-soft">بيانات الحالة <span className="text-muted">(للموظفين، مش بتتطبع)</span></p>
            <div className="flex flex-wrap gap-2">
              {intakeInfo.map((label) => <span key={label} className="rounded-full bg-paper-2 px-3 py-1 text-xs text-ink-soft">{label}</span>)}
            </div>
          </section> : null}
        </div>

        <div ref={printRef} className="mx-auto w-full max-w-4xl">
          <ReportSheet report={report} lab={labProfile} lang={lang} template={templateChoice || undefined} interactive />
        </div>
      </AppShell>
    </div>
    <PdfShareDialog
      open={pdfShareOpen}
      onClose={() => setPdfShareOpen(false)}
      build={() => {
        if (!printRef.current) return Promise.reject(new Error("التقرير لسه بيتحمّل"));
        return buildReportPdf(printRef.current);
      }}
      filename={pdfFilename}
      title={`تقرير ${report.patientName}`}
    />
    <ShareDialog
      channel={shareChannel}
      onClose={() => setShareChannel(null)}
      whatsappNumber={toWhatsAppNumber(report.phone)}
      phoneLabel={report.phone}
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
    <div className="hidden print:block"><ReportSheet report={report} lab={labProfile} lang={lang} template={templateChoice || undefined} /></div>
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
