/**
 * Read-only versions of the home, patients and catalog screens, built from the device copy
 * (the same rows the sync engine mirrors) when there is no connection. Pure functions: no
 * IndexedDB, no network, so they are unit-tested. They mirror the server queries
 * (`searchLabPatients`, `getPatientReports`, `getLabDashboardStats`, `getRecentLabReports`,
 * `listLabCatalog`) closely enough that a screen can render either answer.
 */
import { parseAgeUnit } from "../age.ts";
import { matchesSearch } from "../search-text.ts";
import type { LabAnalytics } from "../analytics.ts";
import type { LabDashboardStats } from "../lab-access.ts";
import type { LabCatalogRow } from "../lab-catalog.ts";
import type { RecentReport } from "../lab-reports.ts";
import type { PatientSummary } from "../patients.ts";
import type { LocalReportSummary } from "./local-reads.ts";

type Row = Record<string, unknown>;

const str = (v: unknown): string => (v == null ? "" : String(v));
const orUndef = (v: unknown): string | undefined => (v == null || v === "" ? undefined : String(v));

export const LAB_TIME_ZONE = "Africa/Cairo";
export const PATIENT_SEARCH_LIMIT = 12;
export const PATIENT_HISTORY_LIMIT = 30;

/** Same rule as the server: the name matches with Arabic letter folding, the other fields as plain text. */
export function toPatientSummaries(patients: Row[], reports: Row[], query: string, limit: number = PATIENT_SEARCH_LIMIT): PatientSummary[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const stats = new Map<string, { count: number; last: string }>();
  for (const r of reports) {
    const id = str(r.patient_id);
    const cur = stats.get(id) ?? { count: 0, last: "" };
    cur.count += 1;
    const created = str(r.created_at);
    if (created > cur.last) cur.last = created;
    stats.set(id, cur);
  }
  const has = (field: unknown) => str(field).toLowerCase().includes(q);
  return patients
    .filter((p) => matchesSearch(query, str(p.full_name)) || has(p.patient_code) || has(p.phone) || has(p.national_id))
    .map((p) => {
      const s = stats.get(str(p.id));
      return {
        id: str(p.id),
        patientCode: str(p.patient_code),
        fullName: str(p.full_name),
        age: Number(p.age || 0),
        ageUnit: parseAgeUnit(p.age_unit),
        gender: (str(p.gender) === "أنثى" ? "أنثى" : "ذكر") as PatientSummary["gender"],
        phone: orUndef(p.phone),
        nationalId: orUndef(p.national_id),
        reportCount: s?.count ?? 0,
        lastReportAt: s?.last ? s.last : undefined,
      } satisfies PatientSummary;
    })
    .sort((a, b) => {
      if (a.lastReportAt && b.lastReportAt && a.lastReportAt !== b.lastReportAt) return a.lastReportAt < b.lastReportAt ? 1 : -1;
      if (a.lastReportAt && !b.lastReportAt) return -1;
      if (!a.lastReportAt && b.lastReportAt) return 1;
      return a.fullName.localeCompare(b.fullName, "ar");
    })
    .slice(0, limit);
}

/** One patient's reports, newest first, like `getPatientReports`. */
export function toPatientReports(reports: Row[], patientId: string): { id: string; sample_id: string | null; status: string; created_at: string }[] {
  return reports
    .filter((r) => str(r.patient_id) === patientId)
    .map((r) => ({ id: str(r.id), sample_id: orUndef(r.sample_id) ?? null, status: str(r.status), created_at: str(r.created_at) }))
    .sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0))
    .slice(0, PATIENT_HISTORY_LIMIT);
}

/** Calendar day (YYYY-MM-DD) of a moment in the lab's time zone; "" when the value is not a date. */
export function labDayKey(value: unknown, timeZone: string = LAB_TIME_ZONE): string {
  const ms = typeof value === "number" ? value : Date.parse(str(value));
  if (!Number.isFinite(ms)) return "";
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(ms));
}

/** The five home-screen counters, computed like `getLabDashboardStats`. */
export function toDashboardStats(patients: Row[], reports: Row[], results: Row[], nowMs: number, timeZone: string = LAB_TIME_ZONE): LabDashboardStats {
  const today = labDayKey(nowMs, timeZone);
  const live = reports.filter((r) => str(r.status) !== "cancelled");
  const todays = live.filter((r) => labDayKey(r.created_at, timeZone) === today);
  const todayIds = new Set(todays.map((r) => str(r.id)));
  const criticalToday = new Set(results.filter((x) => str(x.flag) === "critical" && todayIds.has(str(x.report_id))).map((x) => str(x.report_id)));
  return {
    patients: patients.length,
    reportsToday: todays.length,
    pendingReview: reports.filter((r) => str(r.status) === "pending_review").length,
    approved: reports.filter((r) => str(r.status) === "approved").length,
    critical: criticalToday.size,
  };
}

/** The latest five non-cancelled reports (input is already newest first, as `toReportSummaries` returns). */
export function toRecentReports(summaries: LocalReportSummary[], limit = 5): RecentReport[] {
  return summaries
    .filter((r) => r.status !== "cancelled")
    .slice(0, limit)
    .map((r) => ({
      id: r.id,
      patientName: r.patientName,
      age: r.age,
      ageUnit: r.ageUnit,
      gender: r.gender,
      status: r.status,
      createdAt: r.createdAt,
      criticalCount: r.criticalCount,
      flaggedCount: r.flaggedCount,
    }));
}

/** The catalog screen's rows, ordered like `listLabCatalog` (category, then test name). */
export function toCatalogRows(rows: Row[]): LabCatalogRow[] {
  return rows
    .map((r) => ({
      id: str(r.id),
      test_name: str(r.test_name),
      category_id: str(r.category_id),
      category_name_ar: str(r.category_name_ar),
      category_name_en: str(r.category_name_en),
      unit: str(r.unit),
      male_range: str(r.male_range),
      female_range: str(r.female_range),
      age_ranges: orUndef(r.age_ranges) ?? null,
      method_info: orUndef(r.method_info) ?? null,
      is_active: r.is_active !== false,
    }))
    .sort((a, b) => (a.category_id === b.category_id ? (a.test_name < b.test_name ? -1 : a.test_name > b.test_name ? 1 : 0) : a.category_id < b.category_id ? -1 : 1));
}

/** Calendar day (YYYY-MM-DD) `daysBack` days before `today` (a YYYY-MM-DD key); pure date arithmetic, no time zone. */
function shiftDayKey(today: string, daysBack: number): string {
  const [y, m, d] = today.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d - daysBack)).toISOString().slice(0, 10);
}

/**
 * The analytics screen, computed like `getLabAnalytics`: last 14 days of report counts (every status,
 * zero-filled), status breakdown, the 8 most-ordered tests, and the totals. Days follow the lab's time zone.
 */
export function toLabAnalytics(patients: Row[], reports: Row[], results: Row[], nowMs: number, timeZone: string = LAB_TIME_ZONE): LabAnalytics {
  const today = labDayKey(nowMs, timeZone);
  const perDay = new Map<string, number>();
  const perStatus = new Map<string, number>();
  for (const r of reports) {
    const day = labDayKey(r.created_at, timeZone);
    if (day) perDay.set(day, (perDay.get(day) ?? 0) + 1);
    const status = str(r.status);
    perStatus.set(status, (perStatus.get(status) ?? 0) + 1);
  }
  const daily = Array.from({ length: 14 }, (_, i) => {
    const day = shiftDayKey(today, 13 - i);
    return { day, count: perDay.get(day) ?? 0 };
  });

  const reportIds = new Set(reports.map((r) => str(r.id)));
  const mine = results.filter((x) => reportIds.has(str(x.report_id)));
  const perTest = new Map<string, number>();
  for (const x of mine) {
    const name = str(x.test_name);
    perTest.set(name, (perTest.get(name) ?? 0) + 1);
  }
  const topTests = [...perTest.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "ar"))
    .slice(0, 8);

  return {
    daily,
    statusBreakdown: [...perStatus.entries()].map(([status, count]) => ({ status, count })),
    topTests,
    criticalCount: mine.filter((x) => str(x.flag) === "critical").length,
    totalPatients: patients.length,
    totalReports: reports.length,
  };
}
