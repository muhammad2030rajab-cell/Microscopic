import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { CATEGORIES } from "@/lib/tests-catalog";
import { logAudit } from "@/lib/audit";
import { parseAgeRanges } from "@/lib/age-ranges";

async function getLabUserId(sql: Awaited<ReturnType<typeof getSql>>, userId: string): Promise<string | null> {
  const rows = await sql<{ id: string }>`select id from lab_users where auth_user_id = ${userId} limit 1`;
  return rows[0]?.id ?? null;
}

export type LabCatalogRow = {
  id: string;
  test_name: string;
  category_id: string;
  category_name_ar: string;
  category_name_en: string;
  unit: string;
  male_range: string;
  female_range: string;
  /** Age-specific ranges as plain text (see age-ranges.ts), or null. */
  age_ranges: string | null;
  /** How the test is performed (from the reagent-kit pamphlet), or null. */
  method_info: string | null;
  is_active: boolean;
};

/** Roles that may write method notes. "viewer" stays read-only. */
const METHOD_EDIT_ROLES = new Set(["owner", "technician", "reviewer"]);
export const METHOD_INFO_MAX_LENGTH = 4000;

async function getLab(sql: Awaited<ReturnType<typeof getSql>>, userId: string) {
  const rows = await sql<{ lab_id: string; role: string }>`
    select lu.lab_id, lu.role
    from lab_users lu
    inner join labs l on l.id = lu.lab_id
    where lu.auth_user_id = ${userId} and lu.is_active = true and l.is_active = true
    limit 1
  `;
  if (!rows.length) throw new Error("LAB_ACCESS_REQUIRED");
  return rows[0];
}

async function ensureSeeded(sql: Awaited<ReturnType<typeof getSql>>, labId: string) {
  const count = await sql<{ count: number }>`select count(*)::int as count from lab_test_catalog where lab_id = ${labId}`;
  const total = CATEGORIES.reduce((n, c) => n + c.tests.length, 0);
  // Top up labs seeded before names were made unique per category (stool
  // "Color" / "Blood" / "RBCs" were silently skipped). Existing rows and any
  // range edits are untouched (on conflict do nothing).
  if ((count[0]?.count ?? 0) >= total) return;

  for (const category of CATEGORIES) {
    for (const test of category.tests) {
      const id = crypto.randomUUID();
      await sql.query(
        `insert into lab_test_catalog
          (id, lab_id, test_name, category_id, category_name_ar, category_name_en, unit, male_range, female_range)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         on conflict (lab_id, category_id, test_name) do nothing`,
        [id, labId, test.name, category.id, category.nameAr, category.nameEn, test.unit, test.male, test.female],
      );
    }
  }
}

export const listLabCatalog = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<LabCatalogRow[]> => {
    const sql = await getSql();
    const lab = await getLab(sql, context.userId);
    await ensureSeeded(sql, lab.lab_id);
    return sql<LabCatalogRow>`
      select id, test_name, category_id, category_name_ar, category_name_en,
             unit, male_range, female_range, age_ranges, method_info, is_active
      from lab_test_catalog
      where lab_id = ${lab.lab_id}
      order by category_id, test_name
    `;
  });

export type CatalogItemEdit = { id: string; unit: string; maleRange: string; femaleRange: string; ageRanges?: string | null; isActive: boolean };

/**
 * The one place a catalog test is edited: the online page calls it through `updateLabCatalogItem`, and the
 * sync push calls it for an edit a device made offline. With `expectedVersion` the update only happens if
 * the row is still at that version (checked in the same statement as the write), so a device can never
 * overwrite a newer change; `updated: false` then means "someone changed it first".
 */
export async function updateLabCatalogItemForUser(userId: string, data: CatalogItemEdit, opts: { expectedVersion?: number } = {}): Promise<{ updated: boolean }> {
  const sql = await getSql();
  const lab = await getLab(sql, userId);
  if (lab.role !== "owner") throw new Error("OWNER_ACCESS_REQUIRED");

  // Validate on the server too: the page validates for feedback, this is the gate.
  const ageText = (data.ageRanges ?? "").trim();
  if (ageText) {
    const parsed = parseAgeRanges(ageText);
    if (!parsed.ok) throw new Error(parsed.error);
  }
  const guarded = opts.expectedVersion !== undefined;
  const updated = await sql.query<{ id: string }>(
    `update lab_test_catalog
     set unit=$1, male_range=$2, female_range=$3, age_ranges=$4, is_active=$5, updated_at=current_timestamp
     where id=$6 and lab_id=$7${guarded ? " and version=$8" : ""}
     returning id`,
    [data.unit.trim(), data.maleRange.trim(), data.femaleRange.trim(), ageText || null, Boolean(data.isActive), data.id, lab.lab_id, ...(guarded ? [opts.expectedVersion] : [])],
  );
  // Online save keeps its old behaviour (no error for an unknown id); only a guarded write reports "not updated".
  if (guarded && !updated.length) return { updated: false };

  await logAudit(sql, {
    labId: lab.lab_id,
    actorUserId: await getLabUserId(sql, userId),
    actorAuthUserId: userId,
    action: "catalog.update",
    entityType: "lab_test_catalog",
    entityId: data.id,
  });

  return { updated: true };
}

export const updateLabCatalogItem = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context, data }: { context: { userId: string }; data: CatalogItemEdit }) => {
    await updateLabCatalogItemForUser(context.userId, data);
    return { ok: true };
  });

export const updateLabCatalogMethod = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context, data }: { context: { userId: string }; data: { id: string; methodInfo: string | null } }) => {
    const sql = await getSql();
    const lab = await getLab(sql, context.userId);
    if (!METHOD_EDIT_ROLES.has(lab.role)) throw new Error("METHOD_EDIT_NOT_ALLOWED");

    const text = (data.methodInfo ?? "").trim();
    if (text.length > METHOD_INFO_MAX_LENGTH) throw new Error("METHOD_INFO_TOO_LONG");

    // lab_id in the WHERE keeps this inside the caller's own lab.
    const updated = await sql<{ id: string }>`
      update lab_test_catalog
      set method_info = ${text || null}, updated_at = current_timestamp
      where id = ${data.id} and lab_id = ${lab.lab_id}
      returning id
    `;
    if (!updated.length) throw new Error("CATALOG_ITEM_NOT_FOUND");

    await logAudit(sql, {
      labId: lab.lab_id,
      actorUserId: await getLabUserId(sql, context.userId),
      actorAuthUserId: context.userId,
      action: "catalog.method_update",
      entityType: "lab_test_catalog",
      entityId: data.id,
    });

    return { ok: true };
  });
