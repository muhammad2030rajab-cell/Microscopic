/**
 * Archive filters, remembered for the session and settable from other pages
 * (the home screen's "under review" and "critical today" cards open the
 * archive already filtered). Pure parsing + tiny storage wrappers.
 */

export const REPORT_FILTERS_KEY = "rajab:reports-filters";

export type ReportStatusFilter = "all" | "draft" | "pending_review" | "approved" | "cancelled";
export type ReportPeriodFilter = "all" | "today" | "month" | "year";

export interface ReportFilters {
  q: string;
  status: ReportStatusFilter;
  period: ReportPeriodFilter;
  onlyCritical: boolean;
}

export const DEFAULT_REPORT_FILTERS: ReportFilters = { q: "", status: "all", period: "all", onlyCritical: false };

const STATUSES = ["all", "draft", "pending_review", "approved", "cancelled"];
const PERIODS = ["all", "today", "month", "year"];

/** Keep only well-formed fields; anything unknown or malformed is ignored. */
export function parseReportFilters(raw: unknown): Partial<ReportFilters> {
  if (!raw || typeof raw !== "object") return {};
  const r = raw as Record<string, unknown>;
  const out: Partial<ReportFilters> = {};
  if (typeof r.q === "string") out.q = r.q.slice(0, 200);
  if (typeof r.status === "string" && STATUSES.includes(r.status)) out.status = r.status as ReportStatusFilter;
  if (typeof r.period === "string" && PERIODS.includes(r.period)) out.period = r.period as ReportPeriodFilter;
  if (typeof r.onlyCritical === "boolean") out.onlyCritical = r.onlyCritical;
  return out;
}

export function loadReportFilters(): Partial<ReportFilters> {
  try {
    return parseReportFilters(JSON.parse(sessionStorage.getItem(REPORT_FILTERS_KEY) || "null"));
  } catch {
    return {};
  }
}

export function saveReportFilters(filters: ReportFilters): void {
  try {
    sessionStorage.setItem(REPORT_FILTERS_KEY, JSON.stringify(filters));
  } catch {
    /* storage blocked: filters just won't be remembered */
  }
}

/** Open-the-archive-filtered helper: call it from a link's onClick before navigating. */
export function presetReportFilters(preset: Partial<ReportFilters>): void {
  saveReportFilters({ ...DEFAULT_REPORT_FILTERS, ...parseReportFilters(preset) });
}
