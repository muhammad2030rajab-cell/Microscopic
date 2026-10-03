import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { requireLabPermission } from "@/lib/lab-users";
import { createLabReportForUser, deleteLabReportForUser, updateLabReportForUser, type CreateLabReportInput } from "@/lib/lab-reports";
import { decidePush, type ServerRowInfo } from "@/lib/sync-engine/conflict";
import type { PushResult } from "@/lib/sync-engine/engine";
import {
  clampSyncLimit,
  collapseChanges,
  isSyncEntity,
  parsePushBatch,
  parseSyncCursor,
  SYNC_ENTITIES,
  type PushChangeInput,
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

/**
 * The push half of device sync: changes a device made while offline.
 *
 * Reports only (v1). A device sends COMMANDS, not rows — the same input the
 * online forms send — so validation, ranges, flags and audit logging all run on
 * the server exactly as for an online save. `decidePush` (tested) says whether
 * a change may apply; a stale edit becomes a conflict and never overwrites.
 *
 * Each change gets its own verdict; one failing never blocks the others. The
 * item id doubles as `clientRequestId`, so re-sending after a lost response
 * cannot create a second report.
 *
 * Known limit: the version check and the write are separate statements, so two
 * devices pushing the same report within milliseconds can race. Acceptable for
 * v1 (drafts, one lab); a `where version = $n` guard on the update closes it.
 */
export const pushSyncChanges = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context, data }: { context: { userId: string }; data: { changes: unknown } }): Promise<PushResult[]> => {
    const changes = parsePushBatch(data);
    if (!changes.length) return [];
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

    const results: PushResult[] = [];
    for (const change of changes) {
      try {
        results.push(await applyOnePush(sql, context.userId, labId, change));
      } catch (err) {
        // Permission / validation errors from the shared report code: this item only.
        results.push({ id: change.id, status: "rejected", reason: err instanceof Error ? err.message : "PUSH_FAILED" });
      }
    }
    return results;
  });

type Sql = Awaited<ReturnType<typeof getSql>>;

async function applyOnePush(sql: Sql, userId: string, labId: string, change: PushChangeInput): Promise<PushResult> {
  const isCreate = change.entity === "reports" && change.op === "upsert" && change.baseVersion === null;

  // A report the device created is found by its request id (the server picks the real id);
  // anything else by the id the device holds.
  const found = await sql.query<{ id: string; version: number; status: string }>(
    isCreate
      ? `select id, version, status from reports where lab_id = $1 and client_request_id = $2 limit 1`
      : `select id, version, status from reports where lab_id = $1 and id = $2 limit 1`,
    [labId, isCreate ? change.id : change.entityId],
  );
  const server: ServerRowInfo = found.length ? { version: Number(found[0].version), status: found[0].status } : null;

  const decision = decidePush({ entity: change.entity, op: change.op, baseVersion: change.baseVersion, server });
  if (decision.kind === "reject") return { id: change.id, status: "rejected", reason: decision.reason };
  if (decision.kind === "conflict") return { id: change.id, status: "conflict", reason: decision.reason };
  if (decision.kind === "already_applied") {
    return { id: change.id, status: "applied", version: server?.version ?? null, serverId: found[0]?.id };
  }

  // decision.kind === "apply" — only reports reach this point (decidePush rejects the rest).
  const payload = (change.payload ?? {}) as Record<string, unknown>;
  let reportId = change.entityId;
  if (change.op === "delete") {
    await deleteLabReportForUser(userId, { id: change.entityId });
    return { id: change.id, status: "applied", version: null };
  }
  if (isCreate) {
    const created = await createLabReportForUser(userId, { ...(payload as unknown as CreateLabReportInput), clientRequestId: change.id });
    reportId = created.id;
  } else {
    await updateLabReportForUser(userId, { ...(payload as unknown as CreateLabReportInput), id: change.entityId });
  }
  const after = await sql.query<{ version: number }>(`select version from reports where lab_id = $1 and id = $2 limit 1`, [labId, reportId]);
  return { id: change.id, status: "applied", version: after.length ? Number(after[0].version) : null, serverId: reportId };
}
