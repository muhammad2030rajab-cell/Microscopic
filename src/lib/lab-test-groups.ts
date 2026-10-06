import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { normalizeGroupInput, parseCatalogIds, type TestGroup } from "@/lib/test-groups";

async function getLab(sql: Awaited<ReturnType<typeof getSql>>, userId: string) {
  const rows = await sql<{ lab_id: string; role: string; lab_user_id: string }>`
    select lu.lab_id, lu.role, lu.id as lab_user_id
    from lab_users lu
    inner join labs l on l.id = lu.lab_id
    where lu.auth_user_id = ${userId} and lu.is_active = true and l.is_active = true
    limit 1
  `;
  if (!rows.length) throw new Error("LAB_ACCESS_REQUIRED");
  return rows[0];
}

/** The lab's test groups, by name. Any member of the lab may read them (the new-report screen needs them). */
export const listLabTestGroups = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }: { context: { userId: string } }): Promise<TestGroup[]> => {
    const sql = await getSql();
    const lab = await getLab(sql, context.userId);
    const rows = await sql<{ id: string; name: string; catalog_ids: unknown }>`
      select id, name, catalog_ids from lab_test_groups where lab_id = ${lab.lab_id} order by name
    `;
    return rows.map((r) => ({ id: r.id, name: r.name, catalogIds: parseCatalogIds(r.catalog_ids) }));
  });

/** Create (no id) or update (id) a group. Owner only, like the catalog it points into. */
export const saveLabTestGroup = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context, data }: { context: { userId: string }; data: { id?: string; name: string; catalogIds: string[] } }): Promise<TestGroup> => {
    const sql = await getSql();
    const lab = await getLab(sql, context.userId);
    if (lab.role !== "owner") throw new Error("OWNER_ACCESS_REQUIRED");

    const input = normalizeGroupInput(data.name, data.catalogIds);
    if (!input.ok) throw new Error(input.error);

    // Every id must be a test of THIS lab's catalog (never trust ids from the browser).
    const known = await sql.query<{ id: string }>(`select id from lab_test_catalog where lab_id = $1 and id = any($2::text[])`, [lab.lab_id, input.catalogIds]);
    if (known.length !== input.catalogIds.length) throw new Error("GROUP_UNKNOWN_TEST");

    const id = data.id?.trim() || crypto.randomUUID();
    try {
      if (data.id) {
        const updated = await sql.query<{ id: string }>(
          `update lab_test_groups set name = $1, catalog_ids = $2::jsonb, updated_at = current_timestamp where id = $3 and lab_id = $4 returning id`,
          [input.name, JSON.stringify(input.catalogIds), id, lab.lab_id],
        );
        if (!updated.length) throw new Error("GROUP_NOT_FOUND");
      } else {
        await sql.query(`insert into lab_test_groups (id, lab_id, name, catalog_ids) values ($1, $2, $3, $4::jsonb)`, [id, lab.lab_id, input.name, JSON.stringify(input.catalogIds)]);
      }
    } catch (error) {
      const text = error instanceof Error ? `${error.message} ${(error as { code?: string }).code ?? ""}` : "";
      if (/23505|lab_test_groups_lab_id_name_key|duplicate key/i.test(text)) throw new Error("GROUP_NAME_TAKEN");
      throw error;
    }

    await logAudit(sql, {
      labId: lab.lab_id,
      actorUserId: lab.lab_user_id,
      actorAuthUserId: context.userId,
      action: data.id ? "test_group.update" : "test_group.create",
      entityType: "lab_test_groups",
      entityId: id,
    });
    return { id, name: input.name, catalogIds: input.catalogIds };
  });

export const deleteLabTestGroup = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context, data }: { context: { userId: string }; data: { id: string } }) => {
    const sql = await getSql();
    const lab = await getLab(sql, context.userId);
    if (lab.role !== "owner") throw new Error("OWNER_ACCESS_REQUIRED");
    await sql.query(`delete from lab_test_groups where id = $1 and lab_id = $2`, [data.id, lab.lab_id]);
    await logAudit(sql, {
      labId: lab.lab_id,
      actorUserId: lab.lab_user_id,
      actorAuthUserId: context.userId,
      action: "test_group.delete",
      entityType: "lab_test_groups",
      entityId: data.id,
    });
    return { ok: true };
  });
