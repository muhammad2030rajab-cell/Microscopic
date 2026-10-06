/**
 * Builds a CSV of the reports list, for a backup or for opening in Excel.
 * Pure on purpose (no imports) so it runs in the unit tests too.
 *
 * - Starts with a UTF-8 BOM, otherwise Excel shows Arabic text as garbage.
 * - A text cell that starts with = + - @ would be run as a formula by Excel / Sheets, so it gets a leading apostrophe.
 * - National ID is left out on purpose: a file that travels by chat should carry as little identity data as possible.
 */
export type CsvReportRow = {
  patientCode: string;
  patientName: string;
  age: number;
  gender: string;
  phone?: string;
  sampleId: string;
  doctor: string;
  branchName?: string | null;
  createdAt: string;
  status: string;
  testCount: number;
  flaggedCount: number;
  criticalCount: number;
};

const HEADERS = ["كود المريض", "اسم المريض", "السن", "النوع", "الهاتف", "رقم العينة", "الطبيب", "الفرع", "التاريخ", "الحالة", "عدد التحاليل", "غير طبيعية", "حرجة"];

/** One safe CSV cell. Text that looks like a formula is neutralised before quoting. */
export function csvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  let text = String(value);
  if (typeof value === "string" && /^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** YYYY-MM-DD HH:mm in the device's own time, or the original text when it is not a date. */
export function csvDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function reportsToCsv(rows: CsvReportRow[], statusLabel: (status: string) => string): string {
  const lines = [HEADERS.map(csvCell).join(",")];
  for (const r of rows) {
    lines.push(
      [
        r.patientCode,
        r.patientName,
        r.age,
        r.gender,
        r.phone ?? "",
        r.sampleId,
        r.doctor,
        r.branchName ?? "",
        csvDate(r.createdAt),
        statusLabel(r.status),
        r.testCount,
        r.flaggedCount,
        r.criticalCount,
      ]
        .map(csvCell)
        .join(","),
    );
  }
  return "\uFEFF" + lines.join("\r\n") + "\r\n";
}
