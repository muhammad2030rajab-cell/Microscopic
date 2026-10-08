import { createServerFn } from "@tanstack/react-start";
import { randomUUID } from "node:crypto";
import { auth } from "@/lib/auth/server";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { logEvent } from "@/lib/logger.server";
import { deleteAuthUser } from "@/lib/platform-admin.server";
import { passwordPolicyError } from "@/lib/password-policy";
import { assertCanAddUser } from "@/lib/lab-plans";
import { formatJoinCode, generateJoinCode, hashJoinCode, isJoinRole, JOIN_DEFAULT_ROLE, presetPermissions } from "@/lib/join-requests";

export type LabRole = "owner" | "supervisor" | "technician" | "reviewer" | "viewer";

/** كل الصلاحيات القابلة للمنح، بشكل مستقل عن الدور الوظيفي. */
export type LabPermission =
  | "patients.view"
  | "patients.create"
  | "patients.edit"
  | "patients.delete"
  | "reports.view"
  | "reports.create"
  | "reports.edit"
  | "reports.approve"
  | "reports.delete"
  | "reports.print"
  | "reports.export"
  | "billing.manage"
  | "inventory.manage"
  | "users.manage";

export type LabPermissions = Partial<Record<LabPermission, boolean>>;

export type LabStaff = {
  id: string;
  username: string;
  name: string | null;
  role: LabRole;
  permissions: LabPermissions;
  isActive: boolean;
  createdAt: string;
  /** null = all branches (owner, or staff not tied to a branch). */
  branchId: string | null;
};

export const ALL_LAB_PERMISSIONS: LabPermission[] = [
  "patients.view", "patients.create", "patients.edit", "patients.delete",
  "reports.view", "reports.create", "reports.edit", "reports.approve", "reports.delete", "reports.print", "reports.export",
  "billing.manage",
  "inventory.manage",
  "users.manage",
];

export const ROLE_LABELS: Record<LabRole, string> = {
  owner: "مالك المعمل",
  supervisor: "مشرف",
  technician: "فني معمل",
  reviewer: "مراجع",
  viewer: "مشاهد",
};

export const ASSIGNABLE_ROLES: Exclude<LabRole, "owner">[] = [
  "supervisor", "technician", "reviewer", "viewer",
];

function parsePermissions(raw: LabPermissions | string | null | undefined): LabPermissions {
  if (!raw) return {};
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw) as LabPermissions;
    } catch {
      return {};
    }
  }
  return raw;
}

function allPermissionsGranted(): LabPermissions {
  return Object.fromEntries(ALL_LAB_PERMISSIONS.map((p) => [p, true])) as LabPermissions;
}

function normalizePermissions(permissions?: LabPermissions): LabPermissions {
  const result: LabPermissions = {};
  for (const permission of ALL_LAB_PERMISSIONS) {
    if (permissions?.[permission] === true) result[permission] = true;
  }
  return result;
}

/** دالة داخلية: بيانات المستخدم الحالي وصلاحياته الفعلية داخل معمله. */
async function getLabUserContext(userId: string) {
  const sql = await getSql();
  const rows = await sql<{ id: string; lab_id: string; role: LabRole; branch_id: string | null }>`
    select id, lab_id, role, branch_id from lab_users where auth_user_id = ${userId} and is_active = true limit 1
  `;
  if (!rows.length) throw new Error("LAB_ACCESS_REQUIRED");
  const user = rows[0];

  if (user.role === "owner") {
    return { sql, labId: user.lab_id, labUserId: user.id, role: user.role, branchId: null as string | null, permissions: allPermissionsGranted() };
  }

  const permissionRows = await sql<{ permissions: LabPermissions | string | null }>`
    select permissions from lab_user_permissions where lab_user_id = ${user.id} limit 1
  `;
  const permissions = parsePermissions(permissionRows[0]?.permissions);
  return { sql, labId: user.lab_id, labUserId: user.id, role: user.role, branchId: user.branch_id, permissions };
}

/** يستخدمها UI العميل: يرجّع الدور والصلاحيات الفعلية للمستخدم الحالي. */
export const getCurrentLabPermissions = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { labId, labUserId, role, permissions } = await getLabUserContext(context.userId);
    return { labId, labUserId, role, permissions };
  });

/** يستخدمها أي دالة خادم تحتاج تتأكد إن المستخدم يملك صلاحية معينة قبل التنفيذ. */
export async function requireLabPermission(userId: string, permission: LabPermission) {
  const context = await getLabUserContext(userId);
  if (context.role === "owner") return context;
  if (context.permissions[permission] !== true) throw new Error("PERMISSION_DENIED");
  return context;
}

async function getManagerContext(userId: string) {
  const context = await getLabUserContext(userId);
  if (context.role !== "owner" && context.permissions["users.manage"] !== true) {
    throw new Error("USERS_MANAGE_REQUIRED");
  }
  return context;
}

function normalizeUsername(value: string) {
  return value.trim().toLowerCase();
}

function labLoginEmail(username: string) {
  return `${username}@lab.local`;
}

export const listLabStaff = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<LabStaff[]> => {
    const { sql, labId } = await getManagerContext(context.userId);
    const rows = await sql<{
      id: string; username: string; name: string | null; role: LabRole;
      is_active: boolean; created_at: string | Date; permissions: LabPermissions | string | null; branch_id: string | null;
    }>`
      select lu.id, lu.username, u.name, lu.role, lu.is_active, lu.created_at, lup.permissions, lu.branch_id
      from lab_users lu
      left join "user" u on u.id = lu.auth_user_id
      left join lab_user_permissions lup on lup.lab_user_id = lu.id
      where lu.lab_id = ${labId} and lu.pending_approval = false
      order by case when lu.role = 'owner' then 0 when lu.role = 'supervisor' then 1 else 2 end, lu.created_at asc
    `;
    return rows.map((row) => ({
      id: row.id,
      username: row.username,
      name: row.name,
      role: row.role,
      permissions: row.role === "owner" ? allPermissionsGranted() : parsePermissions(row.permissions),
      isActive: row.is_active,
      createdAt: String(row.created_at),
      branchId: row.role === "owner" ? null : row.branch_id,
    }));
  });

export const createLabStaff = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context, data }: {
    context: { userId: string };
    data: { username: string; password: string; name?: string; role?: Exclude<LabRole, "owner">; permissions?: LabPermissions };
  }) => {
    const { sql, labId, labUserId: actorLabUserId } = await getManagerContext(context.userId);
    const username = normalizeUsername(data.username);
    const password = data.password;
    const name = data.name?.trim() || username;
    const role = data.role || "supervisor";
    const permissions = normalizePermissions(data.permissions);

    if (!/^[a-z0-9._-]{3,40}$/.test(username)) {
      throw new Error("اسم المستخدم يجب أن يكون 3-40 حرفًا إنجليزيًا أو أرقامًا أو ._- فقط");
    }
    const passwordError = passwordPolicyError(password);
    if (passwordError) throw new Error(passwordError);
    if (!ASSIGNABLE_ROLES.includes(role)) throw new Error("الصلاحية غير صالحة");

    await assertCanAddUser(sql, labId);
    const duplicate = await sql<{ id: string }>`select id from lab_users where username = ${username} limit 1`;
    if (duplicate.length) throw new Error("اسم المستخدم موجود بالفعل");

    const created = await auth.api.signUpEmail({
      body: { name, email: labLoginEmail(username), password },
    });
    if (!created?.user?.id) throw new Error("تعذر إنشاء حساب الموظف");

    const staffId = randomUUID();
    try {
      await sql.query(
        `insert into lab_users (id, lab_id, auth_user_id, username, role) values ($1,$2,$3,$4,$5)`,
        [staffId, labId, created.user.id, username, role],
      );
      await sql.query(
        `insert into lab_user_permissions (lab_user_id, permissions) values ($1,$2::jsonb)
         on conflict (lab_user_id) do update set permissions = excluded.permissions, updated_at = current_timestamp`,
        [staffId, JSON.stringify(permissions)],
      );
    } catch (error) {
      // بدون ده، فشل الإدخال (زي تعارض اسم مستخدم متزامن) كان بيسيب حساب دخول
      // حقيقي بلا أي معمل مرتبط بيه — نفس مشكلة الحسابات اليتيمة في platform-admin.ts.
      await deleteAuthUser(sql, created.user.id);
      logEvent("error", "lab_staff.create.failed", { labId, error: String(error) });
      throw error;
    }

    await logAudit(sql, {
      labId, actorUserId: actorLabUserId, actorAuthUserId: context.userId,
      action: "team.create", entityType: "lab_user", entityId: staffId,
    });

    return { id: staffId, username, name, role, permissions };
  });

export const updateLabStaff = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context, data }: {
    context: { userId: string };
    data: { id: string; role?: Exclude<LabRole, "owner">; permissions?: LabPermissions; isActive?: boolean };
  }) => {
    const { sql, labId, labUserId: actorLabUserId } = await getManagerContext(context.userId);
    const rows = await sql<{ id: string; role: LabRole }>`
      select id, role from lab_users where id = ${data.id} and lab_id = ${labId} limit 1
    `;
    if (!rows.length) throw new Error("USER_NOT_FOUND");
    if (rows[0].role === "owner") throw new Error("لا يمكن تعديل حساب مالك المعمل من هنا");

    if (data.role && !ASSIGNABLE_ROLES.includes(data.role)) throw new Error("الصلاحية غير صالحة");
    if (typeof data.role === "undefined" && typeof data.permissions === "undefined" && typeof data.isActive === "undefined") {
      throw new Error("لا يوجد تعديل");
    }

    if (typeof data.role !== "undefined") {
      await sql.query(`update lab_users set role=$1, updated_at=current_timestamp where id=$2 and lab_id=$3`, [data.role, data.id, labId]);
    }
    if (typeof data.isActive !== "undefined") {
      if (data.isActive) {
        const current = await sql<{ is_active: boolean }>`select is_active from lab_users where id = ${data.id} and lab_id = ${labId} limit 1`;
        if (current[0] && current[0].is_active === false) await assertCanAddUser(sql, labId);
      }
      await sql.query(`update lab_users set is_active=$1, updated_at=current_timestamp where id=$2 and lab_id=$3`, [data.isActive, data.id, labId]);
    }
    if (typeof data.permissions !== "undefined") {
      const permissions = normalizePermissions(data.permissions);
      await sql.query(
        `insert into lab_user_permissions (lab_user_id, permissions) values ($1,$2::jsonb)
         on conflict (lab_user_id) do update set permissions = excluded.permissions, updated_at = current_timestamp`,
        [data.id, JSON.stringify(permissions)],
      );
    }

    await logAudit(sql, {
      labId, actorUserId: actorLabUserId, actorAuthUserId: context.userId,
      action: "team.update", entityType: "lab_user", entityId: data.id,
    });

    return { ok: true };
  });


// ───────────────────────── طلبات الانضمام (كود الانضمام) ─────────────────────────
// Same rule as creating staff by hand: the owner, or anyone with "users.manage".

export type JoinOverview = { enabled: boolean; pending: number };
export type JoinRequestRow = { id: string; username: string; name: string | null; requestedAt: string };

/** Is the join code on, and how many people are waiting for an answer. */
export const getJoinOverview = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<JoinOverview> => {
    const { sql, labId } = await getManagerContext(context.userId);
    const rows = await sql<{ enabled: boolean; pending: number }>`
      select (join_code_hash is not null) as enabled,
             (select count(*)::int from lab_users where lab_id = labs.id and pending_approval = true) as pending
      from labs where id = ${labId}
    `;
    return { enabled: Boolean(rows[0]?.enabled), pending: Number(rows[0]?.pending ?? 0) };
  });

/** Make a new code (the old one stops working at once) or switch joining off. The code is only ever shown here, once. */
export const setJoinCode = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context, data }: { context: { userId: string }; data: { action: "generate" | "disable" } }): Promise<{ code: string | null }> => {
    const { sql, labId, labUserId } = await getManagerContext(context.userId);
    const audit = (action: string) =>
      logAudit(sql, { labId, actorUserId: labUserId, actorAuthUserId: context.userId, action, entityType: "lab", entityId: labId });

    if (data.action === "disable") {
      await sql.query(`update labs set join_code_hash = null where id = $1`, [labId]);
      await audit("join.code_disable");
      return { code: null };
    }
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const code = generateJoinCode();
      try {
        await sql.query(`update labs set join_code_hash = $1 where id = $2`, [await hashJoinCode(code), labId]);
      } catch (error) {
        if (/23505|duplicate key|labs_join_code_hash_idx/i.test(`${error instanceof Error ? error.message : ""} ${(error as { code?: string }).code ?? ""}`)) continue; // two labs drew the same code
        throw error;
      }
      await audit("join.code_generate");
      return { code: formatJoinCode(code) };
    }
    throw new Error("تعذر إنشاء كود جديد. جرّب تاني");
  });

/** People who used the code and are waiting, oldest first. */
export const listJoinRequests = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<JoinRequestRow[]> => {
    const { sql, labId } = await getManagerContext(context.userId);
    const rows = await sql<{ id: string; username: string; name: string | null; created_at: string | Date }>`
      select lu.id, lu.username, u.name, lu.created_at
      from lab_users lu
      left join "user" u on u.id = lu.auth_user_id
      where lu.lab_id = ${labId} and lu.pending_approval = true
      order by lu.created_at asc
    `;
    return rows.map((r) => ({ id: r.id, username: r.username, name: r.name, requestedAt: String(r.created_at) }));
  });

/** Approve (with a role; its standard permissions are given) or reject (the account is deleted). */
export const decideJoinRequest = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context, data }: { context: { userId: string }; data: { id: string; approve: boolean; role?: string } }) => {
    const { sql, labId, labUserId: actor } = await getManagerContext(context.userId);
    // lab_id in every WHERE keeps this inside the manager's own lab.
    const rows = await sql<{ id: string; auth_user_id: string | null }>`
      select id, auth_user_id from lab_users where id = ${data.id} and lab_id = ${labId} and pending_approval = true limit 1
    `;
    if (!rows.length) throw new Error("الطلب مش موجود (ممكن يكون اتقرر فيه قبل كده)");
    const audit = (action: string) =>
      logAudit(sql, { labId, actorUserId: actor, actorAuthUserId: context.userId, action, entityType: "lab_user", entityId: data.id });

    if (!data.approve) {
      if (rows[0].auth_user_id) await deleteAuthUser(sql, rows[0].auth_user_id); // cascades to the lab_users row
      else await sql.query(`delete from lab_users where id = $1 and lab_id = $2`, [data.id, labId]);
      await audit("join.reject");
      return { ok: true as const };
    }

    const role = isJoinRole(data.role) ? data.role : JOIN_DEFAULT_ROLE;
    await assertCanAddUser(sql, labId);
    await sql.query(
      `update lab_users set is_active = true, pending_approval = false, role = $1, updated_at = current_timestamp
       where id = $2 and lab_id = $3 and pending_approval = true`,
      [role, data.id, labId],
    );
    await sql.query(
      `insert into lab_user_permissions (lab_user_id, permissions) values ($1,$2::jsonb)
       on conflict (lab_user_id) do update set permissions = excluded.permissions, updated_at = current_timestamp`,
      [data.id, JSON.stringify(presetPermissions(role))],
    );
    await audit("join.approve");
    return { ok: true as const };
  });
