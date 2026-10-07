import { useState } from "react";
import { Check, ChevronLeft, FlaskConical, PackageCheck, Play, Printer, ScanLine } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { SampleBarcode } from "@/components/report/sample-barcode";
import { updateSampleWorkflow, type SampleStatus } from "@/lib/lab-reports";

const STEPS: { key: SampleStatus; label: string; icon: typeof ScanLine }[] = [
  { key: "registered", label: "مسجلة", icon: ScanLine },
  { key: "collected", label: "تم السحب", icon: FlaskConical },
  { key: "received", label: "استُلمت", icon: PackageCheck },
  { key: "processing", label: "قيد التشغيل", icon: Play },
  { key: "ready", label: "جاهزة", icon: Check },
];

export function SampleWorkflow({ reportId, sampleId, initialStatus, initialSection, canEdit }: { reportId: string; sampleId: string; initialStatus: SampleStatus; initialSection?: string; canEdit: boolean }) {
  const [status, setStatus] = useState(initialStatus);
  const [section, setSection] = useState(initialSection ?? "");
  const [busy, setBusy] = useState(false);
  const index = Math.max(0, STEPS.findIndex((s) => s.key === status));
  const next = STEPS[index + 1];

  async function advance() {
    if (!next || !canEdit) return;
    setBusy(true);
    try {
      const result = await updateSampleWorkflow({ data: { id: reportId, status: next.key, section } });
      setStatus(result.status);
      toast.success(`تم تحديث حالة العينة إلى «${next.label}»`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "تعذر تحديث حالة العينة");
    } finally { setBusy(false); }
  }

  return <section className="mb-4 rounded-lg border border-line bg-elevated p-4 print:hidden">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <div className="flex items-center gap-2"><ScanLine className="size-5 text-teal" /><h2 className="font-display text-base font-semibold">مسار العينة</h2></div>
        <p className="mt-1 text-xs text-muted">تتبّع العينة من التسجيل حتى جاهزية التقرير.</p>
      </div>
      <div className="rounded-lg border border-line bg-paper p-2 text-center">
        <SampleBarcode value={sampleId} />
        <div dir="ltr" className="mt-1 font-mono text-[10px] text-muted">{sampleId}</div>
      </div>
    </div>

    <div className="mt-4 grid grid-cols-5 gap-1">
      {STEPS.map((step, i) => {
        const Icon = step.icon;
        const done = i <= index;
        return <div key={step.key} className="min-w-0 text-center">
          <div className={`mx-auto flex size-9 items-center justify-center rounded-full border ${done ? "border-teal bg-teal/10 text-teal" : "border-line bg-paper-2 text-muted"}`}><Icon className="size-4" /></div>
          <p className={`mt-1 truncate text-[10px] sm:text-xs ${done ? "font-medium text-ink" : "text-muted"}`}>{step.label}</p>
        </div>;
      })}
    </div>

    <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
      <label className="text-sm"><span className="mb-1.5 block text-ink-soft">القسم / الجهاز</span>
        <input value={section} onChange={(e) => setSection(e.target.value)} placeholder="مثال: كيمياء — جهاز Cobas" disabled={!canEdit || status === "ready"} className="min-h-11 w-full rounded-md border border-line bg-paper px-3 outline-none focus:border-teal" />
      </label>
      <div className="flex flex-wrap gap-2">
        {next ? <Button onClick={advance} disabled={!canEdit || busy}><ChevronLeft className="size-4" />{busy ? "جارٍ التحديث…" : `التالي: ${next.label}`}</Button> : <span className="inline-flex min-h-11 items-center gap-2 rounded-md bg-ok/10 px-3 text-sm text-ok"><Check className="size-4" />العينة جاهزة</span>}
        <Button variant="secondary" type="button" onClick={() => window.print()}><Printer className="size-4" />طباعة الباركود</Button>
      </div>
    </div>
  </section>;
}
