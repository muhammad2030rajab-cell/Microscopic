import { createServerFn } from "@tanstack/react-start";
import { randomUUID } from "node:crypto";
import { auth } from "@/lib/auth/server";
import { getSql, type Sql } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { logEvent } from "@/lib/logger.server";
import {
  createAttemptLimiter,
  hashJoinCode,
  JOIN_DEFAULT_ROLE,
  MAX_PENDING_REQUESTS,
  normalizeJoinCode,
  validateJoinRequest,
} from "@/lib/join-requests";

/**
 * The public half of the join flow (no sign-in): check a code, send a request. A request makes a login that
 * can do NOTHING (is_active = false) until a manager approves it (see the manager functions in lab-users.ts).
 */

// Wrong codes: 8 per visitor per 15 minutes. Requests: 5 per visitor per hour (counted whether or not they work).
const codeFailures = createAttemptLimiter({ max: 8, windowMs: 15 * 60_000 });
const requestsSent = createAttemptLimiter({ max: 5, windowMs: 60 * 60_000 });

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

async function findLabByCode(sql: Sql, code: string): Promise<{ id: string; name: string } | null> {
  const hash = await hashJoinCode(code);
  const rows = await sql<{ id: string; name: string }>`
    select id, name from labs where join_code_hash = ${hash} and is_active = true limit 1
  `;
  return rows[0] ?? null;
}

/** Step 1 of the page: is this code good? Returns the lab's name so the person knows where they are joining. */
export const checkJoinCode = createServerFn({ method: "POST" }).handler(
  async ({ data }: { data: { code: string } }): Promise<{ labName: string }> => {
    const key = await clientKey();
    if (codeFailures.isBlocked(key)) throw new Error("JOIN_TOO_MANY_ATTEMPTS");
    const code = normalizeJoinCode(data?.code);
    const lab = code ? await findLabByCode(await getSql(), code) : null;
    if (!lab) {
      codeFailures.recordFailure(key);
      throw new Error("JOIN_CODE_INVALID");
    }
    return { labName: lab.name };
  },
);

/** Step 2: the person's own username + password. Nothing is usable until a manager approves. */
export const requestLabAccess = createServerFn({ method: "POST" }).handler(
  async ({ data }: { data: { code: string; username: string; name?: string; password: string } }): Promise<{ ok: true }> => {
    const key = await clientKey();
    if (codeFailures.isBlocked(key) || requestsSent.isBlocked(key)) throw new Error("JOIN_TOO_MANY_ATTEMPTS");

    const sql = await getSql();
    const code = normalizeJoinCode(data?.code);
    const lab = code ? await findLabByCode(sql, code) : null;
    if (!lab) {
      codeFailures.recordFailure(key);
      throw new Error("JOIN_CODE_INVALID");
    }

    const input = validateJoinRequest({ username: data.username, name: data.name, password: data.password });
    if (!input.ok) throw new Error(input.error);
    requestsSent.recordFailure(key);

    const waiting = await sql<{ n: number }>`select count(*)::int as n from lab_users where lab_id = ${lab.id} and pending_approval = true`;
    if (Number(waiting[0]?.n ?? 0) >= MAX_PENDING_REQUESTS) throw new Error("JOIN_QUEUE_FULL");

    const taken = await sql<{ id: string }>`select id from lab_users where username = ${input.username} limit 1`;
    if (taken.length) throw new Error("JOIN_USERNAME_TAKEN");

    let authUserId: string;
    try {
      const created = await auth.api.signUpEmail({ body: { name: input.name, email: `${input.username}@lab.local`, password: data.password } });
      if (!created?.user?.id) throw new Error("no user");
      authUserId = created.user.id;
    } catch (error) {
      logEvent("warn", "join.signup_failed", { labId: lab.id, error: String(error) });
      throw new Error("JOIN_USERNAME_TAKEN");
    }

    const labUserId = randomUUID();
    try {
      await sql.query(
        `insert into lab_users (id, lab_id, auth_user_id, username, role, is_active, pending_approval) values ($1,$2,$3,$4,$5,false,true)`,
        [labUserId, lab.id, authUserId, input.username, JOIN_DEFAULT_ROLE],
      );
    } catch (error) {
      // A login with no lab row would be an orphan: undo the account (it cascades to its sessions).
      await sql.query(`delete from "user" where id = $1`, [authUserId]).catch(() => undefined);
      logEvent("error", "join.insert_failed", { labId: lab.id, error: String(error) });
      throw new Error("JOIN_USERNAME_TAKEN");
    }

    await logAudit(sql, {
      labId: lab.id,
      actorUserId: labUserId,
      actorAuthUserId: authUserId,
      action: "join.request",
      entityType: "lab_user",
      entityId: labUserId,
    });
    return { ok: true };
  },
);
