import { createServerFn } from "@tanstack/react-start";
import { randomUUID } from "node:crypto";
import { auth, isHubMode } from "@/lib/auth/server";
import { getSql } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { logEvent } from "@/lib/logger.server";
import { passwordPolicyError } from "@/lib/password-policy";
import { deleteAuthUser } from "@/lib/platform-admin.server";

/**
 * The lab's own program (the Windows .exe, "hub mode") has no platform-admin screens: the customer is only
 * ever a lab user. First launch shows a one-time setup page that creates the lab and its owner account.
 * Everything here refuses to run outside hub mode (never on the cloud deployment).
 */

export type LocalSetupState = {
  /** true only inside the lab's own program. */
  hub: boolean;
  /** hub mode and no lab has been created yet. */
  needsSetup: boolean;
  license: { required: boolean; activated: boolean };
};

export const getLocalSetupState = createServerFn({ method: "GET" }).handler(async (): Promise<LocalSetupState> => {
  if (!isHubMode) return { hub: false, needsSetup: false, license: { required: false, activated: true } };
  const { currentLicenseState } = await import("@/lib/license-runtime.server");
  const license = await currentLicenseState();
  const sql = await getSql();
  const labs = await sql<{ exists: boolean }>`select exists(select 1 from labs) as exists`;
  return {
    hub: true,
    needsSetup: !labs[0]?.exists,
    license: { required: license.required, activated: license.activated },
  };
});

export const setupLocalLab = createServerFn({ method: "POST" }).handler(
  async ({ data }: { data: { name: string; username: string; password: string; doctorName?: string } }) => {
    if (!isHubMode) throw new Error("غير متاح");
    const sql = await getSql();

    const existing = await sql<{ exists: boolean }>`select exists(select 1 from labs) as exists`;
    if (existing[0]?.exists) throw new Error("تم تجهيز البرنامج بالفعل");

    const { currentLicenseState } = await import("@/lib/license-runtime.server");
    const license = await currentLicenseState();
    if (license.required && !license.activated) throw new Error("لازم تفعّل البرنامج بالكود الأول");

    const name = String(data?.name ?? "").trim().replace(/\s+/g, " ");
    const username = String(data?.username ?? "").trim().toLowerCase();
    const password = String(data?.password ?? "");
    const doctorName = String(data?.doctorName ?? "").trim();

    if (name.length < 2 || name.length > 80) throw new Error("اسم المعمل غير صالح");
    if (!/^[a-z0-9._-]{3,40}$/.test(username)) {
      throw new Error("اسم المستخدم لازم يكون 3-40 حرفًا إنجليزيًا أو أرقامًا أو ._- فقط");
    }
    const passwordError = passwordPolicyError(password);
    if (passwordError) throw new Error(passwordError);

    const labId = randomUUID();
    const created = await auth.api.signUpEmail({
      body: { name, email: `${username}@lab.local`, password },
    });
    if (!created?.user?.id) throw new Error("تعذر إنشاء الحساب");

    try {
      await sql.query(`insert into labs (id, name, doctor_name) values ($1,$2,$3)`, [labId, name, doctorName || null]);
      await sql.query(
        `insert into lab_users (id, lab_id, auth_user_id, username, role) values ($1,$2,$3,$4,'owner')`,
        [randomUUID(), labId, created.user.id, username],
      );
    } catch (error) {
      await deleteAuthUser(sql, created.user.id);
      await sql.query(`delete from labs where id = $1`, [labId]).catch(() => undefined);
      logEvent("error", "local_lab.create.failed", { labId, error: String(error) });
      throw error;
    }

    await logAudit(sql, { labId, actorAuthUserId: created.user.id, action: "lab.create", entityType: "lab", entityId: labId });
    return { ok: true as const, username };
  },
);
