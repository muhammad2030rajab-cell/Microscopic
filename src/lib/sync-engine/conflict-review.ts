/**
 * What a person needs to resolve an offline edit the server did not take:
 * a plain-Arabic reason, and a field-by-field comparison of "your edit" against
 * "what the server has now". Pure.
 */
import type { OutboxItem } from "./engine.ts";
import { applyPendingEdit, type LocalReportDetail } from "./local-reads.ts";

const REASONS: Record<string, string> = {
  server_newer: "حد عدّل التقرير ده على الخادم بعد ما بدأت تعدّله.",
  version_mismatch: "نسخة التقرير على الخادم مش مطابقة للنسخة اللي عدّلت عليها.",
  deleted_on_server: "التقرير ده اتحذف من الخادم.",
  report_locked: "التقرير ده اتلغى، فمبقاش ينفع يتعدّل.",
  requires_online: "العملية دي لازم تتم وانت متصل بالنت.",
  not_supported_offline: "العملية دي مش مدعومة أوفلاين.",
  REPORT_NOT_FOUND: "التقرير ده مش موجود على الخادم.",
};

const CATALOG_REASONS: Record<string, string> = {
  server_newer: "حد عدّل التحليل ده على الخادم بعد ما بدأت تعدّله.",
  version_mismatch: "نسخة التحليل على الخادم مش مطابقة للنسخة اللي عدّلت عليها.",
  deleted_on_server: "التحليل ده اتحذف من الخادم.",
  OWNER_ACCESS_REQUIRED: "تعديل الكتالوج للمالك بس.",
};

/** Arabic text for a server verdict. Unknown codes (e.g. a permission error) are shown as-is, never hidden. */
export function describeReason(reason: string | undefined, entity?: string): string {
  if (!reason) return "الخادم ماقبلش التعديل.";
  if (entity === "lab_test_catalog" && CATALOG_REASONS[reason]) return CATALOG_REASONS[reason];
  return REASONS[reason] ?? `الخادم ماقبلش التعديل (${reason}).`;
}

/** Can the person re-apply their edit on top of the server's current copy? Only when the report is still an editable draft. */
export function canReapply(item: Pick<OutboxItem, "status" | "reason">): boolean {
  return item.status === "conflict" && (item.reason === "server_newer" || item.reason === "version_mismatch");
}

/** The same edit, rebased on the server's current version and put back in the queue. */
export function reapplyItem(item: OutboxItem, currentVersion: number): OutboxItem {
  return { ...item, baseVersion: currentVersion, status: "pending", reason: undefined };
}

export type DiffRow = { label: string; mine: string; server: string };

const show = (v: unknown) => (v === undefined || v === null || String(v).trim() === "" ? "—" : String(v));
const ageLabel = (r: LocalReportDetail) => `${r.age} ${r.ageUnit === "months" ? "شهر" : r.ageUnit === "days" ? "يوم" : "سنة"}`;

/** Only the fields that differ, so the person sees exactly what choosing "mine" would change. */
export function diffReportEdit(server: LocalReportDetail, payload: unknown): DiffRow[] {
  const mine = applyPendingEdit(server, payload);
  const rows: DiffRow[] = [];
  const same = (label: string, a: unknown, b: unknown) => {
    if (show(a) !== show(b)) rows.push({ label, mine: show(a), server: show(b) });
  };
  same("اسم المريض", mine.patientName, server.patientName);
  same("كود المريض", mine.patientCode, server.patientCode);
  same("السن", ageLabel(mine), ageLabel(server));
  same("النوع", mine.gender, server.gender);
  same("الهاتف", mine.phone, server.phone);
  same("الطبيب", mine.doctor, server.doctor);
  same("تاريخ أخذ العينة", mine.collectedAt, server.collectedAt);
  same("ملاحظات", mine.notes, server.notes);

  const key = (t: { categoryId: string; name: string }) => `${t.categoryId}:${t.name}`;
  const theirs = new Map(server.tests.map((t) => [key(t), t]));
  const ours = new Map(mine.tests.map((t) => [key(t), t]));
  for (const [k, t] of ours) {
    const o = theirs.get(k);
    if (!o) rows.push({ label: t.name, mine: `${show(t.value)} ${t.unit}`.trim(), server: "غير موجود" });
    else {
      same(t.name, t.value, o.value);
      same(`${t.name} (المدى)`, t.customRange, o.customRange);
    }
  }
  for (const [k, t] of theirs) if (!ours.has(k)) rows.push({ label: t.name, mine: "اتشال", server: `${show(t.value)} ${t.unit}`.trim() });
  return rows;
}

/** Catalog edit vs what the server holds now: only the fields that differ. */
export function diffCatalogEdit(server: Record<string, unknown>, payload: unknown): DiffRow[] {
  const p = (payload ?? {}) as { unit?: string; maleRange?: string; femaleRange?: string; ageRanges?: string | null; isActive?: boolean };
  const rows: DiffRow[] = [];
  const same = (label: string, mine: unknown, theirs: unknown) => {
    if (show(mine) !== show(theirs)) rows.push({ label, mine: show(mine), server: show(theirs) });
  };
  same("الوحدة", p.unit, server.unit);
  same("المدى (ذكر)", p.maleRange, server.male_range);
  same("المدى (أنثى)", p.femaleRange, server.female_range);
  same("نطاقات حسب السن", (p.ageRanges ?? "").trim(), String(server.age_ranges ?? "").trim());
  same("الحالة", p.isActive === undefined ? undefined : p.isActive ? "مفعل" : "متوقف", server.is_active === false ? "متوقف" : "مفعل");
  return rows;
}
