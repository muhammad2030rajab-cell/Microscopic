/**
 * Per-lab report design. Pure module (no imports) so it can be unit-tested with plain node.
 * Everything coming from the database or the settings form goes through `normalizeDesign`,
 * so the print view can trust the shape it gets.
 */

export type ReportPaper = "a4" | "letterhead";
export type ReportTableStyle = "classic" | "modern" | "minimal";
/** Text size of the printed sheet. Applies to the pro-family templates (everything except "standard"). */
export type ReportTextSize = "small" | "normal" | "large";
export const REPORT_TEXT_SIZES: { key: ReportTextSize; label: string; hint: string }[] = [
  { key: "small", label: "صغير", hint: "تقارير فيها تحاليل كتير" },
  { key: "normal", label: "عادي", hint: "الحجم الافتراضي" },
  { key: "large", label: "كبير", hint: "أسهل في القراءة" },
];
/**
 * The printed layouts a lab can choose from. "standard" is the original sheet; the others share
 * one A4 sheet component (pro-report.tsx) and differ in look. Order = order in the picker.
 */
export const REPORT_TEMPLATES = [
  { key: "standard", label: "كلاسيكي", hint: "الشكل الأصلي: بسيط ومألوف" },
  { key: "pro", label: "احترافي", hint: "ترويسة بتدرّج وبطاقة مريض وأقسام ملوّنة" },
  { key: "modern", label: "عصري", hint: "ترويسة ملوّنة كاملة وأرقام كبيرة وأقسام بخط ملوّن" },
  { key: "compact", label: "مختصر", hint: "مدمج لتقارير فيها تحاليل كتير؛ يوفّر ورق وحبر" },
  { key: "formal", label: "رسمي", hint: "ترويسة في النص وخطوط سوداء ولمسة مستشفيات" },
  { key: "banner", label: "بانر", hint: "لافتة باسم المعمل في النص، وشريط ملوّن تحت الصفحة" },
  { key: "elegant", label: "أنيق", hint: "بدون ألوان تعبئة: خطوط رفيعة ومساحات واسعة" },
  { key: "stripe", label: "جانبي", hint: "شريط ملوّن على حافة الصفحة وبطاقات خفيفة" },
] as const;

export type ReportTemplate = (typeof REPORT_TEMPLATES)[number]["key"];

export function isReportTemplate(value: unknown): value is ReportTemplate {
  return REPORT_TEMPLATES.some((t) => t.key === value);
}

export type ReportDesign = {
  template: ReportTemplate;
  /** "#RRGGBB" or null = built-in colours. */
  accent: string | null;
  /** Decorative corner at the top of the sheet (ignored on letterhead paper). */
  showCorner: boolean;
  tableStyle: ReportTableStyle;
  textSize: ReportTextSize;
  /** "letterhead" = the paper already has the lab header/footer printed on it. */
  paper: ReportPaper;
  /** Blank space kept at the top / bottom of every page on letterhead paper (mm). */
  letterheadTopMm: number;
  letterheadBottomMm: number;
  /** Extra line printed in the footer (e.g. working hours). */
  footerNote: string;
  showQr: boolean;
  /** Optional details. All on by default; a lab that wants a cleaner sheet turns them off. */
  showStatus: boolean; // the "Final report / Preliminary" chip
  showReportId: boolean;
  showFlags: boolean; // the flag column (arrows / H, L) and its legend
  showSummary: boolean; // the "N of M results outside the reference range" line
};

export type ReportDesignAssets = {
  signatureUrl: string | null;
  stampUrl: string | null;
};

export const DEFAULT_REPORT_DESIGN: ReportDesign = {
  template: "standard",
  accent: null,
  showCorner: true,
  tableStyle: "classic",
  textSize: "normal",
  paper: "a4",
  letterheadTopMm: 45,
  letterheadBottomMm: 20,
  footerNote: "",
  showQr: true,
  showStatus: true,
  showReportId: true,
  showFlags: true,
  showSummary: true,
};

export const FOOTER_NOTE_MAX = 160;
export const LETTERHEAD_MM = { min: 0, max: 100 } as const;
/** Data-URI cap per image (signature / stamp). */
export const ASSET_MAX_CHARS = 200_000;

export const ACCENT_PRESETS = [
  { hex: "#0f766e", label: "أخضر مزرق" },
  { hex: "#1d4ed8", label: "أزرق" },
  { hex: "#6d28d9", label: "بنفسجي" },
  { hex: "#b91c1c", label: "أحمر" },
  { hex: "#b45309", label: "عنبري" },
  { hex: "#0f172a", label: "كحلي" },
] as const;

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

export function normalizeHex(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const v = value.trim();
  return HEX_RE.test(v) ? v.toLowerCase() : null;
}

function clampMm(value: unknown, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(LETTERHEAD_MM.max, Math.max(LETTERHEAD_MM.min, Math.round(n)));
}

/** Accepts anything (DB json, form state, undefined) and always returns a complete, valid design. */
export function normalizeDesign(input: unknown): ReportDesign {
  const d = DEFAULT_REPORT_DESIGN;
  const o = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  return {
    template: isReportTemplate(o.template) ? o.template : "standard",
    accent: normalizeHex(o.accent),
    showCorner: typeof o.showCorner === "boolean" ? o.showCorner : d.showCorner,
    tableStyle: o.tableStyle === "modern" || o.tableStyle === "minimal" || o.tableStyle === "classic" ? o.tableStyle : d.tableStyle,
    textSize: o.textSize === "small" || o.textSize === "large" || o.textSize === "normal" ? o.textSize : d.textSize,
    paper: o.paper === "letterhead" ? "letterhead" : "a4",
    letterheadTopMm: clampMm(o.letterheadTopMm, d.letterheadTopMm),
    letterheadBottomMm: clampMm(o.letterheadBottomMm, d.letterheadBottomMm),
    footerNote: typeof o.footerNote === "string" ? o.footerNote.trim().replace(/\s+/g, " ").slice(0, FOOTER_NOTE_MAX) : "",
    showQr: typeof o.showQr === "boolean" ? o.showQr : d.showQr,
    showStatus: typeof o.showStatus === "boolean" ? o.showStatus : d.showStatus,
    showReportId: typeof o.showReportId === "boolean" ? o.showReportId : d.showReportId,
    showFlags: typeof o.showFlags === "boolean" ? o.showFlags : d.showFlags,
    showSummary: typeof o.showSummary === "boolean" ? o.showSummary : d.showSummary,
  };
}

/** Only small raster images as data URIs (no svg: it can carry scripts). */
export function normalizeAsset(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const v = value.trim();
  if (!v) return null;
  if (!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(v)) return null;
  if (v.length > ASSET_MAX_CHARS) return null;
  return v;
}

function channel(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

/** WCAG relative luminance of "#RRGGBB". */
export function luminance(hex: string): number {
  const h = normalizeHex(hex);
  if (!h) return 0;
  const r = parseInt(h.slice(1, 3), 16);
  const g = parseInt(h.slice(3, 5), 16);
  const b = parseInt(h.slice(5, 7), 16);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** Text colour that stays readable on top of the accent. */
export function readableOn(hex: string): "#ffffff" | "#0f172a" {
  // Contrast against white vs. against near-black; pick the better one.
  const L = luminance(hex);
  const withWhite = 1.05 / (L + 0.05);
  const withDark = (L + 0.05) / (luminance("#0f172a") + 0.05);
  return withWhite >= withDark ? "#ffffff" : "#0f172a";
}

function toRgb(hex: string): [number, number, number] {
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
}

/** Blend `a` toward `b` by t (0..1); both "#rrggbb". Returns "#rrggbb". */
export function mixHex(a: string, b: string, t: number): string {
  const x = toRgb(a);
  const y = toRgb(b);
  return "#" + x.map((c, i) => Math.round(c * (1 - t) + y[i] * t).toString(16).padStart(2, "0")).join("");
}

export const DEFAULT_ACCENT = "#1d4fb8";

export type AccentPalette = {
  accent: string;
  deep: string;
  soft: string;
  tint: string;
  line: string;
  fg: string;
  fgSoft: string;
};

/**
 * Every colour the printed sheet derives from the accent, as plain hex/rgba. Computed here instead of
 * with CSS color-mix() because the PDF download (html2canvas) throws on color-mix / color() values.
 */
export function accentPalette(accent: string | null): AccentPalette {
  const a = normalizeHex(accent) ?? DEFAULT_ACCENT;
  const fg = readableOn(a);
  return {
    accent: a,
    deep: mixHex(a, "#000000", 0.2),
    soft: mixHex(a, "#ffffff", 0.4),
    tint: mixHex(a, "#ffffff", 0.93),
    line: mixHex(a, "#ffffff", 0.86),
    fg,
    fgSoft: fg === "#ffffff" ? "rgba(255,255,255,0.45)" : "rgba(15,23,42,0.45)",
  };
}
