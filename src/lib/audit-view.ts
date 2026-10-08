import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { requireLabPermission } from "@/lib/lab-users";
import { auditActionLabel, auditGroupPatterns } from "@/lib/audit-labels";

export type AuditEvent = {
  id: string;
  action: string;
  label: string;
  /** Who did it: a lab user's name / username, "إدارة المنصة" for platform staff, or "—". */
  actor: string;
  entityType: string | null;
  entityId: string | null;
  createdAt: string;
};

const PAGE = 50;

/** The lab's activity log (owner, or anyone with "users.manage"). Newest first; pass `before` to page. */
export const listAuditEvents = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context, data }: { context: { userId: string }; data?: { group?: string; before?: string } }): Promise<{ events: AuditEvent[]; hasMore: boolean }> => {
    const { sql, labId } = await requireLabPermission(context.userId, "users.manage");
    const patterns = auditGroupPatterns(data?.group);
    const before = data?.before && !Number.isNaN(Date.parse(data.before)) ? new Date(data.before).toISOString() : null;
    const rows = await sql<{ id: string; action: string; entity_type: string | null; entity_id: string | null; created_at: string | Date; username: string | null; name: string | null; actor_auth_user_id: string | null }>`
      select a.id, a.action, a.entity_type, a.entity_id, a.created_at, u.username, u.name, a.actor_auth_user_id
      from audit_logs a left join lab_users u on u.id = a.actor_user_id
      where a.lab_id = ${labId}
        and (cardinality(${patterns}::text[]) = 0 or a.action like any (${patterns}::text[]))
        and (${before}::timestamptz is null or a.created_at < ${before}::timestamptz)
      order by a.created_at desc
      limit ${PAGE + 1}
    `;
    const events = rows.slice(0, PAGE).map((r) => ({
      id: r.id,
      action: r.action,
      label: auditActionLabel(r.action),
      actor: r.name || r.username || (r.actor_auth_user_id ? "إدارة المنصة" : "—"),
      entityType: r.entity_type,
      entityId: r.entity_id,
      createdAt: new Date(r.created_at).toISOString(),
    }));
    return { events, hasMore: rows.length > PAGE };
  });
