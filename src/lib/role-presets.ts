import type { LabPermissions } from "@/lib/lab-users";

/**
 * Job templates for the team page: one tap fills in the usual permissions of a front-desk clerk, accountant,
 * technician or doctor. They only pre-fill the checkboxes (the owner can still tick or untick anything).
 */
export const ROLE_PRESETS: { key: string; label: string; hint: string; permissions: LabPermissions }[] = [
  {
    key: "reception",
    label: "استقبال",
    hint: "يسجّل المرضى والتقارير ويطبع ويحصّل الفلوس",
    permissions: { "patients.view": true, "patients.create": true, "patients.edit": true, "reports.view": true, "reports.create": true, "reports.print": true, "billing.manage": true },
  },
  {
    key: "accountant",
    label: "محاسب",
    hint: "الحسابات والمدفوعات، يشوف التقارير بس",
    permissions: { "patients.view": true, "reports.view": true, "reports.print": true, "billing.manage": true },
  },
  {
    key: "technician",
    label: "فني معمل",
    hint: "يدخل النتائج ويعدّلها ويتابع الأجهزة والمستلزمات، من غير فلوس",
    permissions: { "patients.view": true, "patients.create": true, "reports.view": true, "reports.create": true, "reports.edit": true, "reports.print": true, "inventory.manage": true },
  },
  {
    key: "doctor",
    label: "دكتور",
    hint: "يراجع ويعتمد ويصدّر التقارير",
    permissions: { "patients.view": true, "reports.view": true, "reports.edit": true, "reports.approve": true, "reports.print": true, "reports.export": true },
  },
];
