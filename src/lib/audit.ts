import { randomUUID } from "node:crypto";
import type { Sql } from "@/lib/db";

/**
 * Record one row in `audit_logs`.
 *
 * FINAL_STATUS.md claimed audit coverage for "report/team/catalog actions",
 * but only report mutations actually wrote to `audit_logs` (see
 * `lab-reports.ts`). This helper is the single insert path so team-management
 * (`lab-users.ts`), catalog (`lab-catalog.ts`) and platform-admin
 * (`platform-admin.ts`) mutations can all log consistently.
 *
 * Never throws: a logging failure must not roll back or block the action it
 * is describing. Failures are printed to stderr so they still surface in
 * server logs / monitoring.
 */
export async function logAudit(
  sql: Sql,
  entry: {
    labId?: string | null;
    /** lab_users.id of the actor, when the actor is a lab user (not a platform admin). */
    actorUserId?: string | null;
    actorAuthUserId: string;
    action: string;
    entityType?: string | null;
    entityId?: string | null;
  },
): Promise<void> {
  try {
    await sql.query(
      `insert into audit_logs (id, lab_id, actor_user_id, actor_auth_user_id, action, entity_type, entity_id)
       values ($1,$2,$3,$4,$5,$6,$7)`,
      [
        randomUUID(),
        entry.labId ?? null,
        entry.actorUserId ?? null,
        entry.actorAuthUserId,
        entry.action,
        entry.entityType ?? null,
        entry.entityId ?? null,
      ],
    );
  } catch (err) {
    console.error(`[audit] failed to record "${entry.action}"`, err);
  }
}
