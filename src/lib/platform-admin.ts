import { assertLicensed } from "@/lib/license-check.server";
import { createServerFn } from "@tanstack/react-start";
import { randomUUID } from "node:crypto";
import { auth } from "@/lib/auth/server";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { logEvent } from "@/lib/logger.server";
import { passwordPolicyError } from "@/lib/password-policy";
import {
  assertPlatformAdmin,
  deleteAuthUser,
  getPlatformAdminContext,
  requirePlatformPermission,
} from "@/lib/platform-admin.server";
import {
  ALL_PLATFORM_PERMISSIONS,
  PLATFORM_PERMISSION_LABELS,
  normalizePlatformPermissions,
  parsePlatformPermissions,
  type PlatformPermission,
  type PlatformPermissions,
} from "@/lib/platform-permissions";

// Re-exported so existing client imports from "@/lib/platform-admin" keep working.
export { ALL_PLATFORM_PERMISSIONS, PLATFORM_PERMISSION_LABELS };
export type { PlatformPermission, PlatformPermissions };

/** يستخدمها UI العميل: صلاحيات المدير الحالي. */
export const getCurrentPlatformPermissions = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { isSuper, permissions } = await getPlatformAdminContext(context.userId);
    return { isSuper, permissions };
  });

/**
 * Public, unauthenticated check for whether the platform has already been
 * bootstrapped. Used by `/admin/setup` to close itself once a first admin
 * exists — previously that route stayed open forever (see AGENTS note in
 * `admin.tsx`: "Keep first-admin bootstrap accessible before any platform
 * admin exists" only skipped the *admin* check, it never re-closed the page).
 * Deliberately returns nothing but a boolean — no admin identity is exposed.
 */
export const platformAdminExists = createServerFn({ method: "GET" }).handler(
  async () => {
    const sql = await getSql();
    const rows = await sql<{ exists: boolean }>`
      select exists(select 1 from platform_admins) as exists
    `;
    return Boolean(rows[0]?.exists);
  },
);

/**
 * Self-service cleanup for the caller's OWN auth account, and only when it is
 * truly orphaned (no platform-admin row, no lab_users row). Used right after
 * a failed `claimFirstPlatformAdmin()` — `authClient.signUp.email` on
 * `/admin/setup` already created a real Better Auth user before the claim is
 * attempted, so a losing race must not leave a stray, unlinked account behind.
 * Scoped to `context.userId` only: a caller can never delete anyone else, and
 * never an account that already holds a role.
 */
export const deleteSelfIfOrphaned = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    const admin = await sql<{ auth_user_id: string }>`
      select auth_user_id from platform_admins where auth_user_id = ${context.userId} limit 1
    `;
    if (admin.length) return { deleted: false };
    const lab = await sql<{ id: string }>`
      select id from lab_users where auth_user_id = ${context.userId} limit 1
    `;
    if (lab.length) return { deleted: false };
    await deleteAuthUser(sql, context.userId);
    return { deleted: true };
  });

export const isPlatformAdmin = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    const rows = await sql<{ auth_user_id: string }>`
      select auth_user_id
      from platform_admins
      where auth_user_id = ${context.userId} and is_active = true
      limit 1
    `;
    return rows.length > 0;
  });

/** Bootstrap the very first platform administrator. */
export const claimFirstPlatformAdmin = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    // Local program: the first admin can only be created after the activation code was accepted.
    await assertLicensed(sql);
    const rows = await sql<{ auth_user_id: string }>`
      insert into platform_admins (auth_user_id, is_super)
      select ${context.userId}, true
      where not exists (select 1 from platform_admins)
      on conflict (auth_user_id) do nothing
      returning auth_user_id
    `;
    const claimed = rows.length > 0;
    if (claimed) {
      await logAudit(sql, {
        actorAuthUserId: context.userId,
        action: "platform_admin.claim",
        entityType: "platform_admin",
        entityId: context.userId,
      });
      logEvent("info", "platform_admin.claimed", { authUserId: context.userId });
    }
    return claimed;
  });

export type AdminLab = {
  id: string;
  name: string;
  nameEn: string | null;
  username: string;
  phone: string | null;
  address: string | null;
  doctorName: string | null;
  isActive: boolean;
  createdAt: string;
  planName: string | null;
  maxUsers: number | null;
  maxReportsPerMonth: number | null;
  /** YYYY-MM-DD or null (no expiry). */
  subscriptionEndsAt: string | null;
  activeUsers: number;
  reportsThisMonth: number;
};

export const listAdminLabs = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await assertPlatformAdmin(context.userId);
    return sql<{
      id: string;
      name: string;
      name_en: string | null;
      username: string;
      phone: string | null;
      address: string | null;
      doctor_name: string | null;
      is_active: boolean;
      created_at: string | Date;
      plan_name: string | null;
      max_users: number | null;
      max_reports_per_month: number | null;
      subscription_ends_at: string | null;
      active_users: number;
      reports_this_month: number;
    }>`
      select l.id, l.name, l.name_en, lu.username, l.phone, l.address,
             l.doctor_name, l.is_active, l.created_at,
             l.plan_name, l.max_users, l.max_reports_per_month,
             to_char(l.subscription_ends_at, 'YYYY-MM-DD') as subscription_ends_at,
             (select count(*)::int from lab_users u where u.lab_id = l.id and u.is_active = true) as active_users,
             (select count(*)::int from reports r
                where r.lab_id = l.id and r.status <> 'cancelled'
                  and r.created_at >= (date_trunc('month', current_timestamp at time zone 'Africa/Cairo') at time zone 'Africa/Cairo')) as reports_this_month
      from labs l
      left join lab_users lu on lu.lab_id = l.id and lu.role = 'owner'
      order by l.created_at desc
    `.then((rows) => rows.map((row) => ({
      id: row.id,
      name: row.name,
      nameEn: row.name_en,
      username: row.username,
      phone: row.phone,
      address: row.address,
      doctorName: row.doctor_name,
      isActive: row.is_active,
      createdAt: String(row.created_at),
      planName: row.plan_name,
      maxUsers: row.max_users,
      maxReportsPerMonth: row.max_reports_per_month,
      subscriptionEndsAt: row.subscription_ends_at,
      activeUsers: Number(row.active_users),
      reportsThisMonth: Number(row.reports_this_month),
    })));
  });

function normalizeUsername(value: string) {
  return value.trim().toLowerCase();
}

function labLoginEmail(username: string) {
  return `${username}@lab.local`;
}

export const createLab = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context, data }: {
    context: { userId: string };
    data: {
      name?: string;
      nameEn?: string;
      username: string;
      password: string;
      phone?: string;
      whatsapp?: string;
      email?: string;
      address?: string;
      doctorName?: string;
      doctorDegree?: string;
      doctorSpecialty?: string;
    };
  }) => {
    const sql = await requirePlatformPermission(context.userId, "labs.create");

    const name = data.name?.trim() || "معمل جديد";
    const username = normalizeUsername(data.username);
    const password = data.password;

    if (name.length < 2) throw new Error("اسم المعمل غير صالح");
    if (!/^[a-z0-9._-]{3,40}$/.test(username)) {
      throw new Error("اسم المستخدم يجب أن يكون 3-40 حرفًا إنجليزيًا أو أرقامًا أو ._- فقط");
    }
    const passwordError = passwordPolicyError(password);
    if (passwordError) throw new Error(passwordError);

    if (name !== "معمل جديد") {
      const duplicate = await sql<{ id: string }>`
        select id from labs where lower(name) = lower(${name}) limit 1
      `;
      if (duplicate.length) throw new Error("اسم المعمل موجود بالفعل");
    }

    const duplicateUsername = await sql<{ id: string }>`
      select id from lab_users where username = ${username} limit 1
    `;
    if (duplicateUsername.length) throw new Error("اسم المستخدم موجود بالفعل");

    const labId = randomUUID();
    const authEmail = labLoginEmail(username);

    // Better Auth stores the password hash in its own account table; we never
    // persist the lab password in our application tables.
    const created = await auth.api.signUpEmail({
      body: {
        name,
        email: authEmail,
        password,
      },
    });

    if (!created?.user?.id) throw new Error("تعذر إنشاء حساب المعمل");

    try {
      await sql.query(
        `insert into labs
          (id, name, name_en, phone, whatsapp, email, address, doctor_name, doctor_degree, doctor_specialty)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [
          labId,
          name,
          data.nameEn?.trim() || null,
          data.phone?.trim() || null,
          data.whatsapp?.trim() || null,
          data.email?.trim() || null,
          data.address?.trim() || null,
          data.doctorName?.trim() || null,
          data.doctorDegree?.trim() || null,
          data.doctorSpecialty?.trim() || null,
        ],
      );

      await sql.query(
        `insert into lab_users (id, lab_id, auth_user_id, username, role)
         values ($1,$2,$3,$4,'owner')`,
        [randomUUID(), labId, created.user.id, username],
      );
    } catch (error) {
      // `deleteAuthUser` cascades to `lab_users` too (see its docstring), so
      // this also cleans up a lab_users row if that insert somehow partially
      // landed. Previously only the `labs` row was rolled back here, which
      // left a real, permanently-orphaned Better Auth account (a login that
      // could never reach any lab or admin surface) behind on every failure.
      await deleteAuthUser(sql, created.user.id);
      await sql.query(`delete from labs where id = $1`, [labId]).catch(() => undefined);
      logEvent("error", "lab.create.failed", { labId, error: String(error) });
      throw error;
    }

    await logAudit(sql, {
      labId,
      actorAuthUserId: context.userId,
      action: "lab.create",
      entityType: "lab",
      entityId: labId,
    });
    logEvent("info", "lab.created", { labId, actorAuthUserId: context.userId });

    return { id: labId, name, username };
  });

/** إيقاف أو إعادة تفعيل معمل بالكامل — كل حسابات المعمل تتوقف عن الدخول فورًا. */
export const toggleLabActive = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context, data }: { context: { userId: string }; data: { labId: string; isActive: boolean } }) => {
    const sql = await requirePlatformPermission(context.userId, "labs.suspend");
    const rows = await sql<{ id: string }>`update labs set is_active = ${data.isActive}, updated_at = current_timestamp where id = ${data.labId} returning id`;
    if (!rows.length) throw new Error("LAB_NOT_FOUND");
    await logAudit(sql, { labId: data.labId, actorAuthUserId: context.userId, action: data.isActive ? "lab.activated" : "lab.suspended", entityType: "lab", entityId: data.labId });
    return { ok: true };
  });

/** حذف معمل نهائيًا مع كل بياناته (مرضى، تقارير، مستخدمين) — إجراء لا يمكن التراجع عنه. */
export const deleteLab = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context, data }: { context: { userId: string }; data: { labId: string } }) => {
    const sql = await requirePlatformPermission(context.userId, "labs.delete");
    // لاب مستخدمي المعمل مرتبطين بحسابات دخول حقيقية في جدول "user" — احذفهم
    // الأول عشان "on delete cascade" في labs يشيل صف lab_users بس مش حساب الدخول نفسه.
    const staff = await sql<{ auth_user_id: string }>`select auth_user_id from lab_users where lab_id = ${data.labId}`;
    for (const member of staff) {
      await deleteAuthUser(sql, member.auth_user_id);
    }
    const rows = await sql<{ id: string }>`delete from labs where id = ${data.labId} returning id`;
    if (!rows.length) throw new Error("LAB_NOT_FOUND");
    await logAudit(sql, { actorAuthUserId: context.userId, action: "lab.deleted", entityType: "lab", entityId: data.labId });
    return { ok: true };
  });

export type PlatformAdminSummary = {
  authUserId: string;
  name: string | null;
  email: string | null;
  isSuper: boolean;
  isActive: boolean;
  permissions: PlatformPermissions;
  createdAt: string;
};

/** يسرد كل مديري المنصة — لأي مدير نشط (مشاهدة فقط، الإدارة الفعلية محمية بصلاحية admins.manage). */
export const listPlatformAdmins = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<PlatformAdminSummary[]> => {
    const sql = await assertPlatformAdmin(context.userId);
    const rows = await sql<{
      auth_user_id: string; name: string | null; email: string | null;
      is_super: boolean; is_active: boolean; created_at: string | Date; permissions: PlatformPermissions | string | null;
    }>`
      select pa.auth_user_id, u.name, u.email, pa.is_super, pa.is_active, pa.created_at, pap.permissions
      from platform_admins pa
      left join "user" u on u.id = pa.auth_user_id
      left join platform_admin_permissions pap on pap.admin_auth_user_id = pa.auth_user_id
      order by pa.is_super desc, pa.created_at asc
    `;
    return rows.map((row) => ({
      authUserId: row.auth_user_id,
      name: row.name,
      email: row.email,
      isSuper: row.is_super,
      isActive: row.is_active,
      permissions: row.is_super ? normalizePlatformPermissions(Object.fromEntries(ALL_PLATFORM_PERMISSIONS.map((p) => [p, true]))) : parsePlatformPermissions(row.permissions),
      createdAt: String(row.created_at),
    }));
  });

/** إنشاء حساب مدير منصة جديد بصلاحيات محددة — لا يمكن إنشاء مدير عام (Super) من هنا. */
export const createPlatformAdmin = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context, data }: { context: { userId: string }; data: { name: string; email: string; password: string; permissions?: PlatformPermissions } }) => {
    const sql = await requirePlatformPermission(context.userId, "admins.manage");

    const name = data.name.trim();
    const email = data.email.trim().toLowerCase();
    if (!name) throw new Error("اسم المدير مطلوب");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("البريد الإلكتروني غير صالح");
    const passwordError = passwordPolicyError(data.password);
    if (passwordError) throw new Error(passwordError);
    const permissions = normalizePlatformPermissions(data.permissions);

    const created = await auth.api.signUpEmail({ body: { name, email, password: data.password } });
    if (!created?.user?.id) throw new Error("تعذر إنشاء الحساب — البريد الإلكتروني مستخدم بالفعل؟");

    try {
      await sql.query(`insert into platform_admins (auth_user_id, is_super, created_by) values ($1, false, $2)`, [created.user.id, context.userId]);
      await sql.query(
        `insert into platform_admin_permissions (admin_auth_user_id, permissions) values ($1,$2::jsonb)
         on conflict (admin_auth_user_id) do update set permissions = excluded.permissions, updated_at = current_timestamp`,
        [created.user.id, JSON.stringify(permissions)],
      );
    } catch (error) {
      await deleteAuthUser(sql, created.user.id);
      logEvent("error", "platform_admin.create.failed", { error: String(error) });
      throw error;
    }

    await logAudit(sql, { actorAuthUserId: context.userId, action: "platform_admin.create", entityType: "platform_admin", entityId: created.user.id });
    return { authUserId: created.user.id, name, email, permissions };
  });

/** تعديل صلاحيات/حالة مدير منصة موجود — لا يمكن تعديل مدير عام (Super) أو تعديل نفسك. */
export const updatePlatformAdmin = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context, data }: { context: { userId: string }; data: { authUserId: string; permissions?: PlatformPermissions; isActive?: boolean } }) => {
    const sql = await requirePlatformPermission(context.userId, "admins.manage");
    if (data.authUserId === context.userId) throw new Error("لا يمكنك تعديل صلاحيات حسابك الخاص");

    const rows = await sql<{ is_super: boolean }>`select is_super from platform_admins where auth_user_id = ${data.authUserId} limit 1`;
    if (!rows.length) throw new Error("ADMIN_NOT_FOUND");
    if (rows[0].is_super) throw new Error("لا يمكن تعديل مدير عام");

    if (typeof data.isActive !== "undefined") {
      await sql.query(`update platform_admins set is_active=$1 where auth_user_id=$2`, [data.isActive, data.authUserId]);
    }
    if (typeof data.permissions !== "undefined") {
      const permissions = normalizePlatformPermissions(data.permissions);
      await sql.query(
        `insert into platform_admin_permissions (admin_auth_user_id, permissions) values ($1,$2::jsonb)
         on conflict (admin_auth_user_id) do update set permissions = excluded.permissions, updated_at = current_timestamp`,
        [data.authUserId, JSON.stringify(permissions)],
      );
    }

    await logAudit(sql, { actorAuthUserId: context.userId, action: "platform_admin.update", entityType: "platform_admin", entityId: data.authUserId });
    return { ok: true };
  });

/** حذف حساب مدير منصة نهائيًا — لا يمكن حذف مدير عام أو حذف نفسك. */
export const deletePlatformAdmin = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context, data }: { context: { userId: string }; data: { authUserId: string } }) => {
    const sql = await requirePlatformPermission(context.userId, "admins.manage");
    if (data.authUserId === context.userId) throw new Error("لا يمكنك حذف حسابك الخاص");

    const rows = await sql<{ is_super: boolean }>`select is_super from platform_admins where auth_user_id = ${data.authUserId} limit 1`;
    if (!rows.length) throw new Error("ADMIN_NOT_FOUND");
    if (rows[0].is_super) throw new Error("لا يمكن حذف مدير عام");

    await deleteAuthUser(sql, data.authUserId);
    await logAudit(sql, { actorAuthUserId: context.userId, action: "platform_admin.deleted", entityType: "platform_admin", entityId: data.authUserId });
    return { ok: true };
  });

export type AdminOverview = {
  labs: { total: number; active: number };
  users: number;
  reports: { total: number; today: number; pending: number };
  recentLabs: { id: string; name: string; isActive: boolean; reports: number }[];
};

/** أرقام لوحة المدير: ملخص سريع للشبكة كلها. */
export const getAdminOverview = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<AdminOverview> => {
    const sql = await assertPlatformAdmin(context.userId);

    const labs = await sql<{ total: number; active: number }>`
      select count(*)::int as total,
             count(*) filter (where is_active)::int as active
      from labs
    `;
    const users = await sql<{ total: number }>`
      select count(*)::int as total from lab_users where is_active = true
    `;
    const reports = await sql<{ total: number; today: number; pending: number }>`
      select count(*)::int as total,
             count(*) filter (where created_at::date = current_date)::int as today,
             count(*) filter (where status = 'pending_review')::int as pending
      from reports
    `;
    const recent = await sql<{ id: string; name: string; is_active: boolean; reports: number }>`
      select l.id, l.name, l.is_active, count(r.id)::int as reports
      from labs l
      left join reports r on r.lab_id = l.id
      group by l.id, l.name, l.is_active, l.created_at
      order by l.created_at desc
      limit 5
    `;

    return {
      labs: labs[0] ?? { total: 0, active: 0 },
      users: users[0]?.total ?? 0,
      reports: reports[0] ?? { total: 0, today: 0, pending: 0 },
      recentLabs: recent.map((row) => ({
        id: row.id,
        name: row.name,
        isActive: row.is_active,
        reports: row.reports,
      })),
    };
  });
