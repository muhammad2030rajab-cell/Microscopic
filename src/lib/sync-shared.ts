/**
 * Pure helpers for the sync change log (see migrations/0017_sync_foundation.sql).
 * No imports, so the server endpoint, the future device clients and the tests
 * all share one definition of what a cursor / entity / page is.
 */

/** Tables recorded in `sync_changes`. Also the whitelist for table names in SQL. */
export const SYNC_ENTITIES = ["patients", "reports", "lab_test_catalog", "report_attachments"] as const;
export type SyncEntity = (typeof SYNC_ENTITIES)[number];

export const SYNC_PAGE_DEFAULT = 200;
export const SYNC_PAGE_MAX = 500;

export type RawSyncChange = {
  seq: number;
  entity: string;
  entity_id: string;
  op: "upsert" | "delete";
  version: number | null;
};

export function isSyncEntity(value: unknown): value is SyncEntity {
  return typeof value === "string" && (SYNC_ENTITIES as readonly string[]).includes(value);
}

/** The `since` cursor a client sends: a non-negative whole number, else 0 (start over). */
export function parseSyncCursor(value: unknown): number {
  const n = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
  return typeof n === "number" && Number.isSafeInteger(n) && n > 0 ? n : 0;
}

export function clampSyncLimit(value: unknown): number {
  const n = typeof value === "number" && Number.isFinite(value) ? Math.floor(value) : SYNC_PAGE_DEFAULT;
  return Math.min(SYNC_PAGE_MAX, Math.max(1, n));
}

/**
 * One page of the log → the latest change per (entity, id). A row edited five
 * times needs one fetch, not five; a row created then deleted collapses to the
 * delete. Output keeps ascending seq order.
 */
export function collapseChanges(changes: RawSyncChange[]): RawSyncChange[] {
  const latest = new Map<string, RawSyncChange>();
  for (const change of changes) {
    const key = `${change.entity}:${change.entity_id}`;
    const seen = latest.get(key);
    if (!seen || change.seq >= seen.seq) latest.set(key, { ...change, seq: Number(change.seq) });
  }
  return [...latest.values()].sort((a, b) => a.seq - b.seq);
}
