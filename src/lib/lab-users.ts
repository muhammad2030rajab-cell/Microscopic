import { createServerFn } from "@tanstack/react-start";
import { randomUUID } from "node:crypto";
import { auth } from "@/lib/auth/server";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql, type Sql } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { logEvent } from "@/lib/logger.server";
import { passwordPolicyError } from "@/lib/password-policy";
import { assertCanAddUser } from "@/lib/lab-plans";

/** See the identical helper + docstring in `platform-admin.ts`. */
async function deleteAuthUser(sql: Sql, authUserId: string): Promise<void> {
  try {
    await sql.query(`delete from "user" where id = $1`, [authUserId]);
  } catch (err) {
    logEvent("error", "auth_user.rollback_failed", { authUserId, error: String(err) });
  }
}

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
      where lu.lab_id = ${labId}
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
