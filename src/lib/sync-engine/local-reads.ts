/**
 * Turns the rows a device keeps locally (as pulled from the server) into the
 * shapes the screens already use, so a screen can show the same thing with no
 * connection. Pure: the screens fetch the rows, this only maps them.
 *
 * Read-only on purpose: offline viewing never changes anything.
 */
import { parseAgeUnit, type AgeUnit } from "../age.ts";

type Row = Record<string, unknown>;
type Status = "draft" | "pending_review" | "approved" | "cancelled";

const str = (v: unknown): string => (v === null || v === undefined ? "" : String(v));
const orUndef = (v: unknown): string | undefined => (str(v) === "" ? undefined : str(v));
const STATUSES: Status[] = ["draft", "pending_review", "approved", "cancelled"];
const status = (v: unknown): Status => (STATUSES.includes(v as Status) ? (v as Status) : "draft");
const gender = (v: unknown): "ذكر" | "أنثى" => (v === "أنثى" ? "أنثى" : "ذكر");

/** Same fields the archive list gets from the server (`listLabReports`). */
export type LocalReportSummary = {
  id: string;
  patientName: string;
  patientCode: string;
  age: number;
  ageUnit: AgeUnit;
  gender: "ذكر" | "أنثى";
  phone?: string;
  nationalId?: string;
  sampleId: string;
  doctor: string;
  createdAt: string;
  collectedAt?: string;
  tests: never[];
  notes?: string;
  status: Status;
  reviewedBy?: string;
  approvedAt?: string;
  testCount: number;
  flaggedCount: number;
  criticalCount: number;
};

/** Same fields as the single-report screen gets from `getLabReport`. */
export type LocalReportDetail = Omit<LocalReportSummary, "tests" | "testCount" | "flaggedCount" | "criticalCount"> & {
  tests: {
    name: string;
    categoryId: string;
    categoryAr: string;
    categoryEn: string;
    value: string;
    unit: string;
    customRange?: string;
  }[];
};

function base(report: Row, patient: Row | undefined) {
  return {
    id: str(report.id),
    patientName: str(patient?.full_name),
    patientCode: str(patient?.patient_code),
    age: Number(patient?.age ?? 0),
    ageUnit: parseAgeUnit(patient?.age_unit),
    gender: gender(patient?.gender),
    phone: orUndef(patient?.phone),
    nationalId: orUndef(patient?.national_id),
    sampleId: str(report.sample_id),
    doctor: str(report.referring_doctor) || "Himself",
    createdAt: str(report.created_at),
    collectedAt: report.collected_at ? str(report.collected_at).slice(0, 10) : undefined,
    notes: orUndef(report.notes),
    status: status(report.status),
    reviewedBy: orUndef(report.reviewed_by),
    approvedAt: orUndef(report.approved_at),
  };
}

const byId = (rows: Row[]) => new Map(rows.map((r) => [str(r.id), r]));

/** Newest first, like the server list. A report whose patient row is missing is skipped, never shown half-empty. */
export function toReportSummaries(reports: Row[], patients: Row[], resultsByReport: Map<string, Row[]>): LocalReportSummary[] {
  const patientById = byId(patients);
  return reports
    .filter((r) => patientById.has(str(r.patient_id)))
    .map((r) => {
      const results = resultsByReport.get(str(r.id)) ?? [];
      return {
        ...base(r, patientById.get(str(r.patient_id))),
        tests: [] as never[],
        testCount: results.length,
        flaggedCount: results.filter((x) => ["high", "low", "abnormal"].includes(str(x.flag))).length,
        criticalCount: results.filter((x) => str(x.flag) === "critical").length,
      };
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function toReportDetail(report: Row | undefined, patient: Row | undefined, results: Row[]): LocalReportDetail | null {
  if (!report || !patient) return null;
  return {
    ...base(report, patient),
    tests: [...results]
      .sort((a, b) => Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0) || str(a.test_name).localeCompare(str(b.test_name)))
      .map((t) => ({
        name: str(t.test_name),
        categoryId: str(t.category_id),
        categoryAr: str(t.category_ar),
        categoryEn: str(t.category_en),
        value: str(t.result_value),
        unit: str(t.unit),
        customRange: orUndef(t.reference_range),
      })),
  };
}
