/** Arabic names for audit-log actions, and the groups the log page can filter by. Pure, unit-tested. */

const LABELS: Record<string, string> = {
  "report.created": "إنشاء تقرير",
  "report.updated": "تعديل تقرير",
  "report.submitted_for_review": "إرسال تقرير للمراجعة",
  "report.approved": "اعتماد تقرير",
  "report.approved_deleted": "حذف تقرير معتمد",
  "report.deleted": "حذف تقرير",
  "billing.prices_updated": "تعديل أسعار التحاليل",
  "billing.payment_added": "تسجيل دفعة",
  "billing.payment_deleted": "حذف دفعة",
  "billing.discount_set": "تعديل خصم فاتورة",
  "team.create": "إضافة مستخدم",
  "team.update": "تعديل مستخدم",
  "user.branch_set": "تغيير فرع مستخدم",
  "branch.created": "إضافة فرع",
  "branch.updated": "تعديل فرع",
  "catalog.update": "تعديل قيم تحليل",
  "catalog.method_update": "تعديل طريقة تحليل",
  "attachment.uploaded": "رفع مرفق",
  "attachment.deleted": "حذف مرفق",
  "lab.report_design_updated": "تعديل تصميم التقرير",
  "lab.report_language_set": "تغيير لغة التقرير",
  "join.request": "طلب انضمام",
  "test_group.delete": "حذف مجموعة تحاليل",
};

export function auditActionLabel(action: string): string {
  return LABELS[action] ?? action;
}

export const AUDIT_GROUPS = [
  { key: "all", label: "الكل", prefixes: [] as string[] },
  { key: "reports", label: "التقارير", prefixes: ["report."] },
  { key: "billing", label: "الحسابات", prefixes: ["billing."] },
  { key: "users", label: "المستخدمون", prefixes: ["team.", "user.", "branch.", "join."] },
  { key: "settings", label: "الإعدادات والكتالوج", prefixes: ["catalog.", "lab.", "test_group.", "attachment."] },
] as const;

export type AuditGroupKey = (typeof AUDIT_GROUPS)[number]["key"];

/** LIKE patterns for a group ("report.%"); empty = no filter. Unknown keys mean no filter. */
export function auditGroupPatterns(key: unknown): string[] {
  const group = AUDIT_GROUPS.find((g) => g.key === key);
  return group ? group.prefixes.map((p) => `${p}%`) : [];
}
