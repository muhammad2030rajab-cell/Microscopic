import { memo, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState, type ChangeEvent, type ReactNode } from "react";
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
import { getReportDesignAssets, setReportLanguage, updateReportDesign, type ReportLanguageSetting } from "@/lib/report-design-settings";
import { languageFromSetting } from "@/components/report/print-view";
import type { LabProfile } from "@/lib/store";
import type { ReportLang } from "@/lib/report-strings";

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

const LANGUAGES: { value: ReportLanguageSetting; label: string; hint: string }[] = [
  { value: "en", label: "English", hint: "إنجليزي بالكامل" },
  { value: "ar", label: "العربية", hint: "عربي بالكامل" },
  { value: "bilingual", label: "English + العربية", hint: "ثنائي اللغة" },
];

export function ReportDesignEditor({ lab, labId, initialDesign, onReportLanguageChange }: { lab: LabProfile; labId: string; initialDesign: unknown; onReportLanguageChange: (language: ReportLanguageSetting) => void }) {
  const reportLang = languageFromSetting(lab.reportLanguage);
  const [langBusy, setLangBusy] = useState(false);
  async function changeLanguage(language: ReportLanguageSetting) {
    if (language === (lab.reportLanguage ?? "en") || langBusy) return;
    setLangBusy(true);
    try {
      await setReportLanguage({ data: { language } });
      onReportLanguageChange(language);
      toast.success("تم تغيير لغة التقرير");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "تعذر تغيير لغة التقرير");
    } finally {
      setLangBusy(false);
    }
  }

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
  // The page is RTL but the scaled sheet must be laid out LTR from its left edge (see ScaledSheet).
  // Previews re-render a full report each; defer them so typing / dragging the colour stays smooth.
  const deferredDesign = useDeferredValue(design);
  const previewLab: LabProfile = useMemo(
    () => ({ ...lab, design: deferredDesign, assets: { signatureUrl, stampUrl } }),
    [lab, deferredDesign, signatureUrl, stampUrl],
  );

  return (
    <section className="mx-auto mt-6 w-full max-w-5xl overflow-hidden rounded-lg border border-line bg-elevated p-4 sm:p-7">
      <h2 className="font-display text-xl font-semibold sm:text-2xl">شكل التقرير</h2>
      <p className="mt-1 text-sm text-ink-soft">اللي تغيّره هنا بيظهر في المعاينة على طول، ومبيتطبق على التقارير إلا لما تدوس «حفظ شكل التقرير».</p>

      <div className="mt-5 grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <div className="min-w-0 space-y-6">
          <fieldset className="min-w-0 space-y-2">
            <legend className="text-sm font-medium">لغة التقرير</legend>
            <p className="text-[11px] leading-5 text-muted">بتتحفظ فورًا وبتتطبق على كل تقارير المعمل. «English» = كل العناوين والتسميات إنجليزي واتجاه الصفحة من الشمال لليمين. (اسم المريض والطبيب بيظهروا زي ما اتكتبوا.)</p>
            <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="لغة التقرير">
              {LANGUAGES.map((l) => {
                const active = (lab.reportLanguage ?? "en") === l.value;
                return (
                  <button key={l.value} type="button" role="radio" aria-checked={active} disabled={langBusy} onClick={() => changeLanguage(l.value)}
                    className={`rounded-lg border p-2.5 text-start ${active ? "border-teal bg-teal/5" : "border-line bg-paper"}`}>
                    <span className="block text-sm font-medium" dir="auto">{l.label}</span>
                    <span className="block text-[11px] text-muted">{l.hint}</span>
                  </button>
                );
              })}
            </div>
          </fieldset>

          <fieldset className="min-w-0 space-y-2">
            <legend className="text-sm font-medium">اختيار القالب</legend>
            <p className="text-[11px] leading-5 text-muted">اختار الشكل الافتراضي للمعمل. الصور دي معاينة ببيانات معملك. وكل مستخدم يقدر يغيّره لطباعة تقرير معيّن من صفحة التقرير.</p>
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3">
              {REPORT_TEMPLATES.map((t) => (
                <button key={t.key} type="button" aria-pressed={design.template === t.key} onClick={() => patch({ template: t.key })}
                  className={`min-w-0 overflow-hidden rounded-lg border bg-paper text-start transition-colors ${design.template === t.key ? "border-teal ring-2 ring-teal/60" : "border-line hover:border-line-strong"}`}>
                  <TemplateThumb template={t.key} lab={previewLab} lang={reportLang} />
                  <span className="block px-2 py-1.5">
                    <span className="flex flex-wrap items-center justify-between gap-1 text-[13px] font-medium leading-5">
                      {t.label}
                      {design.template === t.key ? <span className="rounded-full bg-teal px-2 py-0.5 text-[10px] text-teal-fg">المختار</span> : null}
                    </span>
                    <span className="mt-0.5 line-clamp-2 text-[11px] leading-4 text-muted">{t.hint}</span>
                  </span>
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset className="min-w-0 space-y-2">
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

          <fieldset className="min-w-0 space-y-2">
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
          <fieldset className="min-w-0 space-y-2">
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

          <fieldset className="min-w-0 space-y-2">
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

          <fieldset className="min-w-0 space-y-3">
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
                    className="mt-1 block w-full max-w-full text-xs text-muted file:mr-2 file:rounded-md file:border-0 file:bg-teal/10 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-teal" />
                  {url ? <button type="button" onClick={() => removeImage(kind)} className="mt-1 text-xs text-high hover:underline">شيل {label}</button> : null}
                </div>
              </div>
            ))}
          </fieldset>

          <fieldset className="min-w-0 space-y-2">
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
          <ScaledSheet className="rounded-lg border border-line bg-paper-2">
            <ReportSheet report={SAMPLE_REPORT} lab={previewLab} lang={reportLang} />
          </ScaledSheet>
        </div>
      </div>
    </section>
  );
}

/**
 * Shows a full-size sheet scaled to the width of its box.
 * - The box is forced LTR: this app is RTL, and an 860px block inside a narrower RTL box overflows
 *   to the LEFT, so scaling from the top-left left the preview shifted and clipped.
 * - Height follows the sheet's real height; tiny changes are ignored so the page never "breathes".
 * - `crop` keeps a fixed A4 (210:297) window so the whole page shows in the gallery thumbnails.
 */
function ScaledSheet({ children, className = "", crop = false }: { children: ReactNode; className?: string; crop?: boolean }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.4);
  const [innerHeight, setInnerHeight] = useState(1100);

  useLayoutEffect(() => {
    const box = boxRef.current;
    const inner = innerRef.current;
    if (!box || !inner) return;
    const measure = () => {
      const next = Math.min(1, box.clientWidth / SHEET_WIDTH);
      setScale((prev) => (Math.abs(prev - next) < 0.003 ? prev : next));
      setInnerHeight((prev) => (Math.abs(prev - inner.offsetHeight) < 4 ? prev : inner.offsetHeight));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(box);
    ro.observe(inner);
    return () => ro.disconnect();
  }, []);

  return (
    <div
      ref={boxRef}
      dir="ltr"
      aria-hidden
      className={`relative w-full overflow-hidden ${crop ? "aspect-[210/297]" : ""} ${className}`}
      style={crop ? undefined : { height: innerHeight * scale }}
    >
      <div
        ref={innerRef}
        className="pointer-events-none absolute left-0 top-0 select-none"
        style={{ width: SHEET_WIDTH, transform: `scale(${scale})`, transformOrigin: "top left" }}
      >
        {children}
      </div>
    </div>
  );
}

/** A small live preview of one template (top of the page). Memoised: it only re-renders when the design really changes. */
const TemplateThumb = memo(function TemplateThumb({ template, lab, lang }: { template: ReportTemplate; lab: LabProfile; lang: ReportLang }) {
  return (
    <ScaledSheet crop className="border-b border-line bg-paper-2">
      <ReportSheet report={SAMPLE_REPORT} lab={lab} lang={lang} template={template} />
    </ScaledSheet>
  );
});
