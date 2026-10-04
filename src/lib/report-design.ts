/**
 * Per-lab report design. Pure module (no imports) so it can be unit-tested with plain node.
 * Everything coming from the database or the settings form goes through `normalizeDesign`,
 * so the print view can trust the shape it gets.
 */

export type ReportPaper = "a4" | "letterhead";
export type ReportTableStyle = "classic" | "modern" | "minimal";
/** "standard" = the original layout; "pro" = compact multi-page layout (header/footer repeat on every page). */
export type ReportTemplate = "standard" | "pro";

export type ReportDesign = {
  template: ReportTemplate;
  /** "#RRGGBB" or null = built-in colours. */
  accent: string | null;
  /** Decorative corner at the top of the sheet (ignored on letterhead paper). */
  showCorner: boolean;
  tableStyle: ReportTableStyle;
  /** "letterhead" = the paper already has the lab header/footer printed on it. */
  paper: ReportPaper;
  /** Blank space kept at the top / bottom of every page on letterhead paper (mm). */
  letterheadTopMm: number;
  letterheadBottomMm: number;
  /** Extra line printed in the footer (e.g. working hours). */
  footerNote: string;
  showQr: boolean;
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
  paper: "a4",
  letterheadTopMm: 45,
  letterheadBottomMm: 20,
  footerNote: "",
  showQr: true,
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
    template: o.template === "pro" ? "pro" : "standard",
    accent: normalizeHex(o.accent),
    showCorner: typeof o.showCorner === "boolean" ? o.showCorner : d.showCorner,
    tableStyle: o.tableStyle === "modern" || o.tableStyle === "minimal" || o.tableStyle === "classic" ? o.tableStyle : d.tableStyle,
    paper: o.paper === "letterhead" ? "letterhead" : "a4",
    letterheadTopMm: clampMm(o.letterheadTopMm, d.letterheadTopMm),
    letterheadBottomMm: clampMm(o.letterheadBottomMm, d.letterheadBottomMm),
    footerNote: typeof o.footerNote === "string" ? o.footerNote.trim().replace(/\s+/g, " ").slice(0, FOOTER_NOTE_MAX) : "",
    showQr: typeof o.showQr === "boolean" ? o.showQr : d.showQr,
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
