import { getSql, type Sql } from "@/lib/db";
import { logEvent } from "@/lib/logger.server";
import {
  ALL_PLATFORM_PERMISSIONS,
  normalizePlatformPermissions,
  parsePlatformPermissions,
  type PlatformPermission,
  type PlatformPermissions,
} from "@/lib/platform-permissions";

// Server-only helpers (not server functions). Never import this file from client code;
// import it only for use inside createServerFn handlers.

/**
 * Delete a Better Auth "user" row. `session`/`account` both reference it with
 * `on delete cascade` (see `migrations/auth/0001_auth.sql`), and `lab_users`
 * does too (see `migrations/0002_laboratory_system.sql`), so this is enough
 * to fully undo a `signUpEmail` call — used to roll back an orphaned account
 * when the application-side insert that was supposed to follow it fails.
 * Swallows its own errors: this already runs inside a catch block, and an
 * orphaned auth user is a cleanup nit, never a reason to mask the original
 * error.
 */
export async function deleteAuthUser(sql: Sql, authUserId: string): Promise<void> {
  try {
    await sql.query(`delete from "user" where id = $1`, [authUserId]);
  } catch (err) {
    logEvent("error", "auth_user.rollback_failed", { authUserId, error: String(err) });
  }
}

/** أي مدير منصة نشط (حتى غير الـ Super Admin) يعدّي هنا — للصفحات اللي مجرد مشاهدة. */
export async function assertPlatformAdmin(userId: string) {
  const sql = await getSql();
  const rows = await sql<{ auth_user_id: string }>`
    select auth_user_id
    from platform_admins
    where auth_user_id = ${userId} and is_active = true
    limit 1
  `;
  if (rows.length === 0) throw new Error("FORBIDDEN");
  return sql;
}

export async function getPlatformAdminContext(userId: string) {
  const sql = await getSql();
  const rows = await sql<{ auth_user_id: string; is_super: boolean }>`
    select auth_user_id, is_super from platform_admins where auth_user_id = ${userId} and is_active = true limit 1
  `;
  if (!rows.length) throw new Error("FORBIDDEN");
  if (rows[0].is_super) return { sql, isSuper: true, permissions: normalizePlatformPermissions(Object.fromEntries(ALL_PLATFORM_PERMISSIONS.map((p) => [p, true]))) };
  const permRows = await sql<{ permissions: PlatformPermissions | string | null }>`
    select permissions from platform_admin_permissions where admin_auth_user_id = ${userId} limit 1
  `;
  return { sql, isSuper: false, permissions: parsePlatformPermissions(permRows[0]?.permissions) };
}

export async function requirePlatformPermission(userId: string, permission: PlatformPermission) {
  const context = await getPlatformAdminContext(userId);
  if (!context.isSuper && context.permissions[permission] !== true) throw new Error("PERMISSION_DENIED");
  return context.sql;
}
