import { createServerFn } from "@tanstack/react-start";
import { randomUUID } from "node:crypto";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { logAudit } from "@/lib/audit";

export type Branch = { id: string; name: string; isActive: boolean };

export const BRANCH_NAME_MAX = 60;

async function getOwnerContext(userId: string) {
  const sql = await getSql();
  const rows = await sql<{ id: string; lab_id: string }>`
    select lu.id, lu.lab_id from lab_users lu
    inner join labs l on l.id = lu.lab_id
    where lu.auth_user_id = ${userId} and lu.role = 'owner' and lu.is_active = true and l.is_active = true
    limit 1
  `;
  if (!rows.length) throw new Error("OWNER_REQUIRED");
  return { sql, labId: rows[0].lab_id, labUserId: rows[0].id };
}

/**
 * Branches the current user can use: the owner gets all of the lab's branches;
 * a branch-bound user gets only their own. `myBranchId` is null for the owner
 * and for unassigned staff (they see everything).
 */
export const listBranches = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<{ branches: Branch[]; myBranchId: string | null; isOwner: boolean }> => {
    const sql = await getSql();
    const me = await sql<{ lab_id: string; role: string; branch_id: string | null }>`
      select lu.lab_id, lu.role, lu.branch_id from lab_users lu
      where lu.auth_user_id = ${context.userId} and lu.is_active = true limit 1
    `;
    if (!me.length) throw new Error("LAB_ACCESS_REQUIRED");
    const isOwner = me[0].role === "owner";
    const myBranchId = isOwner ? null : me[0].branch_id;
    const rows = await sql<{ id: string; name: string; is_active: boolean }>`
      select id, name, is_active from branches
      where lab_id = ${me[0].lab_id} and (${myBranchId}::text is null or id = ${myBranchId})
      order by created_at asc
    `;
    return { branches: rows.map((r) => ({ id: r.id, name: r.name, isActive: r.is_active })), myBranchId, isOwner };
  });

function cleanName(value: string): string {
  const name = (value ?? "").trim().replace(/\s+/g, " ");
  if (name.length < 2) throw new Error("اسم الفرع قصير جدًا");
  if (name.length > BRANCH_NAME_MAX) throw new Error(`اسم الفرع أطول من ${BRANCH_NAME_MAX} حرف`);
  return name;
}

export const createBranch = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context, data }: { context: { userId: string }; data: { name: string } }): Promise<Branch> => {
    const { sql, labId, labUserId } = await getOwnerContext(context.userId);
    const name = cleanName(data.name);
    const dup = await sql<{ id: string }>`select id from branches where lab_id = ${labId} and lower(name) = lower(${name}) limit 1`;
    if (dup.length) throw new Error("فيه فرع بنفس الاسم");
    const id = randomUUID();
    await sql.query(`insert into branches (id, lab_id, name) values ($1,$2,$3)`, [id, labId, name]);
    await logAudit(sql, { labId, actorUserId: labUserId, actorAuthUserId: context.userId, action: "branch.created", entityType: "branch", entityId: id });
    return { id, name, isActive: true };
  });

export const updateBranch = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context, data }: { context: { userId: string }; data: { id: string; name?: string; isActive?: boolean } }): Promise<Branch> => {
    const { sql, labId, labUserId } = await getOwnerContext(context.userId);
    if (typeof data.name === "undefined" && typeof data.isActive === "undefined") throw new Error("لا يوجد تعديل");
    const name = typeof data.name === "string" ? cleanName(data.name) : null;
    if (name) {
      const dup = await sql<{ id: string }>`select id from branches where lab_id = ${labId} and lower(name) = lower(${name}) and id <> ${data.id} limit 1`;
      if (dup.length) throw new Error("فيه فرع بنفس الاسم");
    }
    const rows = await sql<{ id: string; name: string; is_active: boolean }>`
      update branches
      set name = coalesce(${name}, name),
          is_active = coalesce(${typeof data.isActive === "boolean" ? data.isActive : null}::boolean, is_active)
      where id = ${data.id} and lab_id = ${labId}
      returning id, name, is_active
    `;
    if (!rows.length) throw new Error("BRANCH_NOT_FOUND");
    await logAudit(sql, { labId, actorUserId: labUserId, actorAuthUserId: context.userId, action: "branch.updated", entityType: "branch", entityId: data.id });
    return { id: rows[0].id, name: rows[0].name, isActive: rows[0].is_active };
  });

/** Assign a staff member to a branch (null = all branches). The owner is never branch-bound. */
export const setUserBranch = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context, data }: { context: { userId: string }; data: { labUserId: string; branchId: string | null } }) => {
    const { sql, labId, labUserId } = await getOwnerContext(context.userId);
    if (data.branchId) {
      const b = await sql<{ id: string }>`select id from branches where id = ${data.branchId} and lab_id = ${labId} and is_active = true limit 1`;
      if (!b.length) throw new Error("الفرع غير موجود أو موقوف");
    }
    const rows = await sql<{ id: string }>`
      update lab_users set branch_id = ${data.branchId}, updated_at = current_timestamp
      where id = ${data.labUserId} and lab_id = ${labId} and role <> 'owner'
      returning id
    `;
    if (!rows.length) throw new Error("المستخدم غير موجود (أو هو مالك المعمل)");
    await logAudit(sql, { labId, actorUserId: labUserId, actorAuthUserId: context.userId, action: "user.branch_set", entityType: "lab_user", entityId: data.labUserId });
    return { ok: true };
  });
