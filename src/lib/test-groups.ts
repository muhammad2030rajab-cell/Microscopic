/** Lab-defined test groups: validation and expansion. Pure, so it is unit-tested and usable offline. */

export const MAX_GROUP_NAME = 60;
export const MAX_GROUP_TESTS = 100;

export type TestGroup = { id: string; name: string; catalogIds: string[] };

export type GroupErrorCode = "GROUP_NAME_REQUIRED" | "GROUP_NAME_TOO_LONG" | "GROUP_TESTS_REQUIRED" | "GROUP_TOO_MANY_TESTS" | "GROUP_UNKNOWN_TEST" | "GROUP_NAME_TAKEN";

const MESSAGES: Record<GroupErrorCode, string> = {
  GROUP_NAME_REQUIRED: "اكتب اسم المجموعة",
  GROUP_NAME_TOO_LONG: `اسم المجموعة أطول من ${MAX_GROUP_NAME} حرف`,
  GROUP_TESTS_REQUIRED: "اختار تحليل واحد على الأقل",
  GROUP_TOO_MANY_TESTS: `المجموعة فيها أكتر من ${MAX_GROUP_TESTS} تحليل`,
  GROUP_UNKNOWN_TEST: "في تحليل مش موجود في الكتالوج. حدّث الصفحة وجرّب تاني",
  GROUP_NAME_TAKEN: "فيه مجموعة بنفس الاسم",
};

/** The Arabic message for a group error thrown by the server (or the raw text when it is something else). */
export function groupErrorMessage(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error ?? "");
  return (MESSAGES as Record<string, string>)[text] ?? "تعذر حفظ المجموعة. جرّب تاني";
}

export type GroupInput = { ok: true; name: string; catalogIds: string[] } | { ok: false; error: GroupErrorCode };

/** Trim the name (inner spaces collapsed), drop blank and repeated ids keeping the first order. */
export function normalizeGroupInput(name: unknown, catalogIds: unknown): GroupInput {
  const cleanName = typeof name === "string" ? name.replace(/\s+/g, " ").trim() : "";
  if (!cleanName) return { ok: false, error: "GROUP_NAME_REQUIRED" };
  if (cleanName.length > MAX_GROUP_NAME) return { ok: false, error: "GROUP_NAME_TOO_LONG" };
  const ids: string[] = [];
  if (Array.isArray(catalogIds)) {
    for (const raw of catalogIds) {
      const id = typeof raw === "string" ? raw.trim() : "";
      if (id && !ids.includes(id)) ids.push(id);
    }
  }
  if (!ids.length) return { ok: false, error: "GROUP_TESTS_REQUIRED" };
  if (ids.length > MAX_GROUP_TESTS) return { ok: false, error: "GROUP_TOO_MANY_TESTS" };
  return { ok: true, name: cleanName, catalogIds: ids };
}

type CatalogLike = { id: string; is_active: boolean };

/**
 * The catalog rows a group stands for, in the group's own order. Tests that were switched off or no longer
 * exist are left out and counted in `missing`, so the screen can say so instead of silently adding less.
 */
export function resolveGroupTests<T extends CatalogLike>(catalogIds: string[], catalog: T[]): { tests: T[]; missing: number } {
  const byId = new Map(catalog.map((c) => [c.id, c]));
  const tests: T[] = [];
  for (const id of catalogIds) {
    const row = byId.get(id);
    if (row && row.is_active) tests.push(row);
  }
  return { tests, missing: catalogIds.length - tests.length };
}

/** Read what the database returns for the jsonb column (already parsed, or still text) as a clean id list. */
export function parseCatalogIds(value: unknown): string[] {
  let v = value;
  if (typeof v === "string") {
    try {
      v = JSON.parse(v);
    } catch {
      return [];
    }
  }
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.length > 0) : [];
}
