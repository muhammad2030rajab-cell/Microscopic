import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { requireLabPermission } from "@/lib/lab-users";
import {
  clampSyncLimit,
  collapseChanges,
  isSyncEntity,
  parseSyncCursor,
  SYNC_ENTITIES,
  type RawSyncChange,
  type SyncEntity,
} from "@/lib/sync-shared";

export type SyncPullResult = {
  /** Latest change per row on this page, in seq order. */
  changes: { seq: number; entity: SyncEntity; entityId: string; op: "upsert" | "delete"; version: number | null }[];
  /** Current rows for the upserts above, by table. A missing row means it was deleted since; its delete arrives on a later page. */
  rows: Record<SyncEntity, Record<string, unknown>[]>;
  /** Results of every upserted report (they are part of the report, not their own entity). */
  reportResults: Record<string, unknown>[];
  /** Send this back as `since` for the next page. */
  cursor: number;
  hasMore: boolean;
};

/**
 * "What changed in my lab since seq N?" — the pull half of device sync.
 * Lab-scoped on the server (the caller never names a lab) and needs the same
 * permission as viewing reports. Table names come from SYNC_ENTITIES, never
 * from the request.
 */
export const pullSyncChanges = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context, data }: { context: { userId: string }; data: { since?: unknown; limit?: unknown } }): Promise<SyncPullResult> => {
    await requireLabPermission(context.userId, "reports.view");
    const sql = await getSql();
    const labRows = await sql<{ lab_id: string }>`
      select lu.lab_id
      from lab_users lu
      inner join labs l on l.id = lu.lab_id
      where lu.auth_user_id = ${context.userId} and lu.is_active = true and l.is_active = true
      limit 1
    `;
    if (!labRows.length) throw new Error("LAB_ACCESS_REQUIRED");
    const labId = labRows[0].lab_id;

    const since = parseSyncCursor(data?.since);
    const limit = clampSyncLimit(data?.limit);

    // One extra row tells us whether another page exists.
    const raw = await sql<RawSyncChange>`
      select seq, entity, entity_id, op, version
      from sync_changes
      where lab_id = ${labId} and seq > ${since}
      order by seq asc
      limit ${limit + 1}
    `;
    const hasMore = raw.length > limit;
    const page = raw.slice(0, limit).map((c) => ({ ...c, seq: Number(c.seq) }));
    const cursor = page.length ? page[page.length - 1].seq : since;
    const collapsed = collapseChanges(page).filter((c) => isSyncEntity(c.entity));

    const rows = Object.fromEntries(SYNC_ENTITIES.map((e) => [e, [] as Record<string, unknown>[]])) as SyncPullResult["rows"];
    for (const entity of SYNC_ENTITIES) {
      const ids = collapsed.filter((c) => c.entity === entity && c.op === "upsert").map((c) => c.entity_id);
      if (!ids.length) continue;
      // `entity` is one of four literals from SYNC_ENTITIES — safe to interpolate.
      rows[entity] = await sql.query<Record<string, unknown>>(
        `select * from ${entity} where lab_id = $1 and id = any($2::text[])`,
        [labId, ids],
      );
    }

    const reportIds = rows.reports.map((r) => String(r.id));
    const reportResults = reportIds.length
      ? await sql.query<Record<string, unknown>>(
          `select rr.* from report_results rr
           inner join reports r on r.id = rr.report_id
           where r.lab_id = $1 and rr.report_id = any($2::text[])
           order by rr.report_id, rr.sort_order`,
          [labId, reportIds],
        )
      : [];

    return {
      changes: collapsed.map((c) => ({
        seq: c.seq,
        entity: c.entity as SyncEntity,
        entityId: c.entity_id,
        op: c.op,
        version: c.version,
      })),
      rows,
      reportResults,
      cursor,
      hasMore,
    };
  });
