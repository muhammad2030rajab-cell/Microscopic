import { useEffect, useLayoutEffect, useRef, useState, type ChangeEvent } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ReportSheet } from "@/components/report/report-sheet";
import { SAMPLE_REPORT } from "@/lib/report-sample";
import {
  ACCENT_PRESETS,
  ASSET_MAX_CHARS,
  FOOTER_NOTE_MAX,
  LETTERHEAD_MM,
  normalizeDesign,
  normalizeHex,
  REPORT_TEMPLATES,
  type ReportDesign,
  type ReportTemplate,
  type ReportTableStyle,
} from "@/lib/report-design";
import { getReportDesignAssets, updateReportDesign } from "@/lib/report-design-settings";
import type { LabProfile } from "@/lib/store";

const SHEET_WIDTH = 860; // px the preview sheet is laid out at before being scaled down

const TABLE_STYLES: { key: ReportTableStyle; label: string; hint: string }[] = [
  { key: "classic", label: "كلاسيكي", hint: "الشكل الحالي" },
  { key: "modern", label: "عصري", hint: "رأس جدول ملوّن" },
  { key: "minimal", label: "مبسّط", hint: "خطوط خفيفة بس" },
];

function readImage(file: File, maxChars: number): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) return reject(new Error("الصورة لازم تكون PNG أو JPG أو WebP"));
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("تعذر قراءة الصورة"));
    reader.onload = () => {
      const url = String(reader.result);
      if (url.length > maxChars) return reject(new Error("الصورة كبيرة — اختر صورة أصغر (حتى حوالي 140 كيلوبايت)"));
      resolve(url);
    };
    reader.readAsDataURL(file);
  });
}

export function ReportDesignEditor({ lab, labId, initialDesign }: { lab: LabProfile; labId: string; initialDesign: unknown }) {
  const [design, setDesign] = useState<ReportDesign>(() => normalizeDesign(initialDesign));
  const [signatureUrl, setSignatureUrl] = useState<string | null>(null);
  const [stampUrl, setStampUrl] = useState<string | null>(null);
  // undefined = leave what is stored untouched
  const [assetsChanged, setAssetsChanged] = useState({ signature: false, stamp: false });
  const [saving, setSaving] = useState(false);
  const patch = (p: Partial<ReportDesign>) => setDesign((d) => ({ ...d, ...p }));

  useEffect(() => {
    let cancelled = false;
    getReportDesignAssets()
      .then((a) => { if (!cancelled) { setSignatureUrl(a.signatureUrl); setStampUrl(a.stampUrl); } })
      .catch(() => { /* preview just shows without them */ });
    return () => { cancelled = true; };
  }, []);

  // Scale the A4-ish sheet to whatever width the card has.
  const boxRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.5);
  useLayoutEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const fit = () => setScale(Math.min(1, el.clientWidth / SHEET_WIDTH));
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  async function pickImage(e: ChangeEvent<HTMLInputElement>, kind: "signature" | "stamp") {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const url = await readImage(file, ASSET_MAX_CHARS);
      if (kind === "signature") setSignatureUrl(url); else setStampUrl(url);
      setAssetsChanged((c) => ({ ...c, [kind]: true }));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "تعذر رفع الصورة");
    }
  }

  function removeImage(kind: "signature" | "stamp") {
    if (kind === "signature") setSignatureUrl(null); else setStampUrl(null);
    setAssetsChanged((c) => ({ ...c, [kind]: true }));
  }

  async function save() {
    setSaving(true);
    try {
      const res = await updateReportDesign({
        data: {
          design,
          signatureUrl: assetsChanged.signature ? signatureUrl : undefined,
          stampUrl: assetsChanged.stamp ? stampUrl : undefined,
        },
      });
      setDesign(res.design);
      setAssetsChanged({ signature: false, stamp: false });
      // Same cache the report page reads, so a print on this device picks the new images up at once.
      try { localStorage.setItem(`rajab:report-assets:${labId}`, JSON.stringify({ signatureUrl: res.signatureUrl, stampUrl: res.stampUrl })); } catch { /* ignore */ }
      toast.success("تم حفظ شكل التقرير");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "تعذر حفظ شكل التقرير");
    } finally {
      setSaving(false);
    }
  }

  const accentValue = design.accent ?? "";
  const previewLab: LabProfile = { ...lab, design, assets: { signatureUrl, stampUrl } };

  return (
    <section className="mx-auto mt-6 max-w-5xl rounded-lg border border-line bg-elevated p-5 sm:p-7">
      <h2 className="font-display text-2xl font-semibold">شكل التقرير</h2>
      <p className="mt-1 text-sm text-ink-soft">اللي تغيّره هنا بيظهر في المعاينة على طول، ومبيتطبق على التقارير إلا لما تدوس «حفظ شكل التقرير».</p>

      <div className="mt-5 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <div className="space-y-6">
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">شكل التقرير</legend>
            <p className="text-[11px] leading-5 text-muted">اختار الشكل الافتراضي للمعمل. الصور دي معاينة ببيانات معملك. وكل مستخدم يقدر يغيّره لطباعة تقرير معيّن من صفحة التقرير.</p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {REPORT_TEMPLATES.map((t) => (
                <button key={t.key} type="button" aria-pressed={design.template === t.key} onClick={() => patch({ template: t.key })}
                  className={`overflow-hidden rounded-xl border-2 bg-paper text-start transition-colors ${design.template === t.key ? "border-teal" : "border-line hover:border-line-strong"}`}>
                  <TemplateThumb template={t.key} lab={previewLab} />
                  <span className="block px-2.5 py-2">
                    <span className="flex items-center justify-between gap-2 text-sm font-medium">
                      {t.label}
                      {design.template === t.key ? <span className="rounded-full bg-teal px-2 py-0.5 text-[10px] text-teal-fg">المختار</span> : null}
                    </span>
                    <span className="mt-0.5 block text-[11px] leading-4 text-muted">{t.hint}</span>
                  </span>
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">التفاصيل اللي تظهر في التقرير</legend>
            <p className="text-[11px] leading-5 text-muted">اقفل اللي مش عايزه عشان التقرير يبقى أنضف. النتيجة الشاذة هتفضل واضحة بلونها وخلفية الصف وشريط المدى حتى لو قفلت العلامات.</p>
            {([
              ["showStatus", "حالة التقرير (نهائي / مبدئي)"],
              ["showReportId", "رقم التقرير"],
              ["showFlags", "عمود العلامات (أسهم / H / L)"],
              ["showSummary", "سطر الملخص (كام نتيجة خارج المدى)"],
            ] as const).map(([key, label]) => (
              <label key={key} className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={design[key]} onChange={(e) => patch({ [key]: e.target.checked })} className="size-4 accent-teal" />
                {label}
              </label>
            ))}
            <button type="button" className="text-xs text-teal hover:underline"
              onClick={() => patch({ showStatus: false, showReportId: false, showFlags: false, showSummary: false })}>
              نسخة مبسّطة (اقفل الكل)
            </button>
          </fieldset>

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">لون المعمل</legend>
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => patch({ accent: null })} aria-pressed={!design.accent}
                className={`rounded-full border px-3 py-1 text-xs ${!design.accent ? "border-teal bg-teal text-teal-fg" : "border-line bg-paper text-muted"}`}>الافتراضي</button>
              {ACCENT_PRESETS.map((c) => (
                <button key={c.hex} type="button" title={c.label} aria-label={c.label} aria-pressed={design.accent === c.hex}
                  onClick={() => patch({ accent: c.hex })}
                  className={`size-8 rounded-full border-2 ${design.accent === c.hex ? "border-ink" : "border-transparent"}`} style={{ background: c.hex }} />
              ))}
              <label className="inline-flex items-center gap-2 text-xs text-muted">
                لون تاني
                <input type="color" value={accentValue || "#0f766e"} onChange={(e) => patch({ accent: normalizeHex(e.target.value) })} className="h-8 w-10 cursor-pointer rounded border border-line bg-paper" />
              </label>
            </div>
            <label className={`flex items-center gap-2 text-sm ${design.template !== "standard" ? "opacity-50" : ""}`}>
              <input type="checkbox" disabled={design.template !== "standard"} checked={design.showCorner} onChange={(e) => patch({ showCorner: e.target.checked })} className="size-4 accent-teal" />
              زخرفة الركن في أعلى الصفحة (الشكل الكلاسيكي بس)
            </label>
          </fieldset>

          {design.template === "standard" ? (
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">شكل الجدول</legend>
            <div className="grid grid-cols-3 gap-2">
              {TABLE_STYLES.map((t) => (
                <button key={t.key} type="button" aria-pressed={design.tableStyle === t.key} onClick={() => patch({ tableStyle: t.key })}
                  className={`rounded-lg border p-3 text-start ${design.tableStyle === t.key ? "border-teal bg-teal/5" : "border-line bg-paper"}`}>
                  <span className="block text-sm font-medium">{t.label}</span>
                  <span className="block text-[11px] text-muted">{t.hint}</span>
                </button>
              ))}
            </div>
          </fieldset>
          ) : null}

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">الورق</legend>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" aria-pressed={design.paper === "a4"} onClick={() => patch({ paper: "a4" })}
                className={`rounded-lg border p-3 text-start ${design.paper === "a4" ? "border-teal bg-teal/5" : "border-line bg-paper"}`}>
                <span className="block text-sm font-medium">ورق A4 عادي</span>
                <span className="block text-[11px] text-muted">الترويسة والتذييل بيتطبعوا مع التقرير</span>
              </button>
              <button type="button" aria-pressed={design.paper === "letterhead"} onClick={() => patch({ paper: "letterhead" })}
                className={`rounded-lg border p-3 text-start ${design.paper === "letterhead" ? "border-teal bg-teal/5" : "border-line bg-paper"}`}>
                <span className="block text-sm font-medium">ورق بترويسة جاهزة</span>
                <span className="block text-[11px] text-muted">نسيب مساحة فاضية لترويسة المعمل المطبوعة</span>
              </button>
            </div>
            {design.paper === "letterhead" ? (
              <div className="grid gap-3 rounded-lg bg-paper p-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="lh-top">مساحة فاضية فوق (مم)</Label>
                  <Input id="lh-top" type="number" min={LETTERHEAD_MM.min} max={LETTERHEAD_MM.max} value={design.letterheadTopMm} dir="ltr"
                    onChange={(e) => patch({ letterheadTopMm: Number(e.target.value) })} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="lh-bottom">مساحة فاضية تحت (مم)</Label>
                  <Input id="lh-bottom" type="number" min={LETTERHEAD_MM.min} max={LETTERHEAD_MM.max} value={design.letterheadBottomMm} dir="ltr"
                    onChange={(e) => patch({ letterheadBottomMm: Number(e.target.value) })} />
                </div>
                <p className="text-[11px] leading-5 text-muted sm:col-span-2">المساحة دي بتتساب فاضية في كل صفحة. اطبع صفحة تجريبية على الورق بتاعك وظبط الأرقام لحد ما التقرير ينزل تحت الترويسة بالظبط. في الطباعة اختار «Margins: None» ومقاس A4 و100%.</p>
              </div>
            ) : null}
          </fieldset>

          <fieldset className="space-y-3">
            <legend className="text-sm font-medium">التوقيع والختم</legend>
            <p className="text-[11px] leading-5 text-muted">بيظهروا على التقارير <strong>المعتمدة</strong> بس، مش على المسودات. صورة PNG بخلفية شفافة أحسن حاجة (حتى حوالي 140 كيلوبايت).</p>
            {([["signature", "التوقيع", signatureUrl], ["stamp", "الختم", stampUrl]] as const).map(([kind, label, url]) => (
              <div key={kind} className="flex items-center gap-3">
                <div className="grid h-14 w-24 shrink-0 place-items-center overflow-hidden rounded-lg border border-line bg-paper text-[11px] text-muted">
                  {url ? <img src={url} alt={label} className="max-h-full max-w-full object-contain" /> : "—"}
                </div>
                <div className="min-w-0">
                  <Label htmlFor={`asset-${kind}`}>{label}</Label>
                  <input id={`asset-${kind}`} type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => pickImage(e, kind)}
                    className="mt-1 block text-xs text-muted file:mr-2 file:rounded-md file:border-0 file:bg-teal/10 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-teal" />
                  {url ? <button type="button" onClick={() => removeImage(kind)} className="mt-1 text-xs text-high hover:underline">شيل {label}</button> : null}
                </div>
              </div>
            ))}
          </fieldset>

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">التذييل</legend>
            <Textarea value={design.footerNote} maxLength={FOOTER_NOTE_MAX} rows={2} onChange={(e) => patch({ footerNote: e.target.value })}
              placeholder="مثال: مواعيد العمل من 8 صباحًا حتى 10 مساءً · خدمة سحب العينات من المنزل" />
            <p className="text-[11px] text-muted">{design.footerNote.length} / {FOOTER_NOTE_MAX}</p>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={design.showQr} onChange={(e) => patch({ showQr: e.target.checked })} className="size-4 accent-teal" />
              رمز QR للتحقق من التقرير (على المعتمد بس)
            </label>
          </fieldset>

          <Button type="button" onClick={save} disabled={saving}>{saving ? "جارٍ الحفظ…" : "حفظ شكل التقرير"}</Button>
        </div>

        <div>
          <p className="mb-2 text-xs text-muted">معاينة (بيانات تجريبية)</p>
          <div ref={boxRef} className="overflow-hidden rounded-lg border border-line bg-paper-2" style={{ height: 1180 * scale }}>
            <div style={{ width: SHEET_WIDTH, transform: `scale(${scale})`, transformOrigin: "top left" }} className="pointer-events-none select-none" aria-hidden>
              <ReportSheet report={SAMPLE_REPORT} lab={previewLab} lang="bi" />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/** A small live preview of one template (top of the page), scaled down to the card width. */
function TemplateThumb({ template, lab }: { template: ReportTemplate; lab: LabProfile }) {
  const ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.2);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fit = () => setScale(el.clientWidth / SHEET_WIDTH);
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <div ref={ref} className="relative aspect-[4/5] w-full overflow-hidden border-b border-line bg-paper-2" aria-hidden>
      <div className="pointer-events-none absolute start-0 top-0 select-none" style={{ width: SHEET_WIDTH, transform: `scale(${scale})`, transformOrigin: "top left" }}>
        <ReportSheet report={SAMPLE_REPORT} lab={lab} lang="bi" template={template} />
      </div>
    </div>
  );
}
