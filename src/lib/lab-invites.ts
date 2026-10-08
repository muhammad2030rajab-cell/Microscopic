import { createServerFn } from "@tanstack/react-start";
import { randomUUID } from "node:crypto";
import { auth } from "@/lib/auth/server";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql, type Sql } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { logEvent } from "@/lib/logger.server";
import { passwordPolicyError } from "@/lib/password-policy";
import { createAttemptLimiter, formatJoinCode, generateJoinCode, hashJoinCode, normalizeJoinCode } from "@/lib/join-requests";
import { inviteStatus, validateNewInvite, validateNewLab, type InviteStatus } from "@/lib/lab-invite-input";
import { deleteAuthUser, requirePlatformPermission } from "@/lib/platform-admin";

/**
 * Platform invitation codes. The platform admin makes a code; whoever types it on /join creates their own lab and
 * owner login. Only the code's hash is stored, so the code is shown once, when it is made.
 */

export type LabInviteRow = {
  id: string;
  label: string;
  uses: number;
  maxUses: number;
  expiresAt: string | null;
  createdAt: string;
  status: InviteStatus;
};

// Wrong codes: 8 per visitor per 15 minutes. Sign-ups: 5 per visitor per hour.
const codeFailures = createAttemptLimiter({ max: 8, windowMs: 15 * 60_000 });
const signups = createAttemptLimiter({ max: 5, windowMs: 60 * 60_000 });

async function clientKey(): Promise<string> {
  try {
    const mod = (await import("@tanstack/react-start/server")) as Record<string, unknown>;
    const header = mod.getRequestHeader as ((name: string) => string | undefined) | undefined;
    const raw = header?.("x-forwarded-for") ?? header?.("x-real-ip") ?? "";
    return raw.split(",")[0].trim() || "unknown";
  } catch {
    return "unknown";
  }
}

// ───────────────────────── platform admin side ─────────────────────────

export const createLabInvite = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context, data }: { context: { userId: string }; data: { label?: string; maxUses?: number; expiresInDays?: number | null } }): Promise<{ code: string }> => {
    const sql = await requirePlatformPermission(context.userId, "labs.create");
    const input = validateNewInvite(data ?? {});
    if (!input.ok) throw new Error(input.error);

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const code = generateJoinCode();
      const id = randomUUID();
      try {
        await sql.query(
          `insert into lab_invites (id, code_hash, label, max_uses, expires_at, created_by)
           values ($1,$2,$3,$4, case when $5::int is null then null else current_timestamp + ($5::int * interval '1 day') end, $6)`,
          [id, await hashJoinCode(code), input.label, input.maxUses, input.expiresInDays, context.userId],
        );
      } catch (error) {
        if (/23505|duplicate key|lab_invites_code_hash_idx/i.test(`${error instanceof Error ? error.message : ""} ${(error as { code?: string }).code ?? ""}`)) continue;
        throw error;
      }
      await logAudit(sql, { labId: null, actorAuthUserId: context.userId, action: "lab_invite.create", entityType: "lab_invite", entityId: id });
      return { code: formatJoinCode(code) };
    }
    throw new Error("تعذر إنشاء كود جديد. جرّب تاني");
  });

export const listLabInvites = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<LabInviteRow[]> => {
    const sql = await requirePlatformPermission(context.userId, "labs.create");
    const rows = await sql<{ id: string; label: string; uses: number; max_uses: number; expires_at: string | Date | null; revoked_at: string | Date | null; created_at: string | Date }>`
      select id, label, uses, max_uses, expires_at, revoked_at, created_at from lab_invites order by created_at desc limit 100
    `;
    return rows.map((r) => ({
      id: r.id,
      label: r.label,
      uses: Number(r.uses),
      maxUses: Number(r.max_uses),
      expiresAt: r.expires_at ? new Date(r.expires_at).toISOString() : null,
      createdAt: new Date(r.created_at).toISOString(),
      status: inviteStatus({ uses: Number(r.uses), maxUses: Number(r.max_uses), expiresAt: r.expires_at, revokedAt: r.revoked_at }),
    }));
  });

export const revokeLabInvite = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context, data }: { context: { userId: string }; data: { id: string } }) => {
    const sql = await requirePlatformPermission(context.userId, "labs.create");
    await sql.query(`update lab_invites set revoked_at = current_timestamp where id = $1 and revoked_at is null`, [data.id]);
    await logAudit(sql, { labId: null, actorAuthUserId: context.userId, action: "lab_invite.revoke", entityType: "lab_invite", entityId: data.id });
    return { ok: true };
  });

// ───────────────────────── public side (no sign-in) ─────────────────────────

async function findActiveInvite(sql: Sql, code: string): Promise<{ id: string; label: string } | null> {
  const rows = await sql<{ id: string; label: string; uses: number; max_uses: number; expires_at: string | Date | null; revoked_at: string | Date | null }>`
    select id, label, uses, max_uses, expires_at, revoked_at from lab_invites where code_hash = ${await hashJoinCode(code)} limit 1
  `;
  const r = rows[0];
  if (!r) return null;
  const status = inviteStatus({ uses: Number(r.uses), maxUses: Number(r.max_uses), expiresAt: r.expires_at, revokedAt: r.revoked_at });
  return status === "active" ? { id: r.id, label: r.label } : null;
}

/** Is this a good invitation code? (Called after the lab join code did not match.) */
export const checkLabInviteCode = createServerFn({ method: "POST" }).handler(
  async ({ data }: { data: { code: string } }): Promise<{ ok: true }> => {
    const key = await clientKey();
    if (codeFailures.isBlocked(key)) throw new Error("INVITE_TOO_MANY_ATTEMPTS");
    const code = normalizeJoinCode(data?.code);
    const invite = code ? await findActiveInvite(await getSql(), code) : null;
    if (!invite) {
      codeFailures.recordFailure(key);
      throw new Error("INVITE_CODE_INVALID");
    }
    return { ok: true };
  },
);

/** Creates the lab and its owner login in one go. Uses up one use of the code. */
export const createLabWithInvite = createServerFn({ method: "POST" }).handler(
  async ({ data }: { data: { code: string; labName: string; ownerName?: string; username: string; password: string } }): Promise<{ username: string }> => {
    const key = await clientKey();
    if (codeFailures.isBlocked(key) || signups.isBlocked(key)) throw new Error("INVITE_TOO_MANY_ATTEMPTS");

    const sql = await getSql();
    const code = normalizeJoinCode(data?.code);
    const invite = code ? await findActiveInvite(sql, code) : null;
    if (!invite) {
      codeFailures.recordFailure(key);
      throw new Error("INVITE_CODE_INVALID");
    }

    const input = validateNewLab({ labName: data.labName, ownerName: data.ownerName, username: data.username });
    if (!input.ok) throw new Error(input.error);
    const passwordError = passwordPolicyError(data.password);
    if (passwordError) throw new Error(passwordError);
    signups.recordFailure(key);

    if ((await sql<{ id: string }>`select id from labs where lower(name) = lower(${input.labName}) limit 1`).length) throw new Error("LAB_NAME_TAKEN");
    if ((await sql<{ id: string }>`select id from lab_users where username = ${input.username} limit 1`).length) throw new Error("USERNAME_TAKEN");

    // Take the use first and atomically: two people racing for the last use cannot both win.
    const taken = await sql<{ id: string }>`
      update lab_invites set uses = uses + 1
      where id = ${invite.id} and revoked_at is null and uses < max_uses and (expires_at is null or expires_at > current_timestamp)
      returning id
    `;
    if (!taken.length) throw new Error("INVITE_CODE_INVALID");
    const giveBack = () => sql.query(`update lab_invites set uses = greatest(uses - 1, 0) where id = $1`, [invite.id]).catch(() => undefined);

    let authUserId: string;
    try {
      const created = await auth.api.signUpEmail({ body: { name: input.ownerName || input.labName, email: `${input.username}@lab.local`, password: data.password } });
      if (!created?.user?.id) throw new Error("no user");
      authUserId = created.user.id;
    } catch (error) {
      await giveBack();
      logEvent("warn", "lab_invite.signup_failed", { inviteId: invite.id, error: String(error) });
      throw new Error("USERNAME_TAKEN");
    }

    const labId = randomUUID();
    try {
      await sql.query(`insert into labs (id, name, invite_id) values ($1,$2,$3)`, [labId, input.labName, invite.id]);
      await sql.query(`insert into lab_users (id, lab_id, auth_user_id, username, role) values ($1,$2,$3,$4,'owner')`, [randomUUID(), labId, authUserId, input.username]);
    } catch (error) {
      await deleteAuthUser(sql, authUserId);
      await sql.query(`delete from labs where id = $1`, [labId]).catch(() => undefined);
      await giveBack();
      logEvent("error", "lab_invite.create_failed", { inviteId: invite.id, error: String(error) });
      throw new Error("SIGNUP_FAILED");
    }

    await logAudit(sql, { labId, actorAuthUserId: authUserId, action: "lab.create_by_invite", entityType: "lab", entityId: labId });
    logEvent("info", "lab.created_by_invite", { labId, inviteId: invite.id });
    return { username: input.username };
  },
);
