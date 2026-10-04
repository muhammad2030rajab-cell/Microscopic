import type { Sql } from "@/lib/db";

/**
 * Platform features the super admin can switch on/off per lab.
 * Only features that are enforced on the server belong here.
 */
export const LAB_FEATURES = [
  { key: "analytics", label: "الإحصائيات", hint: "صفحة الإحصائيات والرسوم البيانية في المعمل" },
  { key: "attachments", label: "مرفقات التقارير", hint: "رفع الصور والملفات على التقرير" },
] as const;

export type LabFeatureKey = (typeof LAB_FEATURES)[number]["key"];

export const LAB_FEATURE_KEYS: string[] = LAB_FEATURES.map((f) => f.key);

export const FEATURE_DISABLED_MESSAGE = "الميزة دي متوقفة لمعملك. تواصل مع الدعم لتفعيلها.";

/** Throws when the platform admin turned this feature off for the lab. */
export async function assertLabFeature(sql: Sql, labId: string, feature: LabFeatureKey): Promise<void> {
  const rows = await sql<{ disabled_features: string[] | null }>`
    select disabled_features from labs where id = ${labId} limit 1
  `;
  if (rows[0]?.disabled_features?.includes(feature)) throw new Error(FEATURE_DISABLED_MESSAGE);
}
