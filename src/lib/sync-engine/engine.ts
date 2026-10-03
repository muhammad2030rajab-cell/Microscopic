/**
 * Device-side sync engine (Android now, the Windows hub later).
 *
 * Pure logic over two small interfaces — LocalStore (SQLite on the phone,
 * an in-memory map in tests) and SyncTransport (HTTP to the cloud or hub) — so
 * it runs and is tested here with no phone and no network.
 *
 * Guarantees:
 *  - a pulled page and its cursor are applied TOGETHER (store.applyPage), so a
 *    crash can never move the cursor past rows that were not saved;
 *  - applying a page twice is harmless (pull is idempotent);
 *  - a network failure leaves every local change in the outbox, untouched;
 *  - the server's verdict decides what leaves the outbox: applied -> removed,
 *    conflict/rejected -> kept, flagged, for a person to resolve.
 */
import { isNetworkError } from "../offline/network-error.ts";
import type { SyncEntity } from "../sync-shared.ts";

export type PulledChange = {
  seq: number;
  entity: SyncEntity;
  entityId: string;
  op: "upsert" | "delete";
  version: number | null;
};

/** Same shape the server's pullSyncChanges returns. */
export type PullPage = {
  changes: PulledChange[];
  rows: Record<SyncEntity, Record<string, unknown>[]>;
  reportResults: Record<string, unknown>[];
  cursor: number;
  hasMore: boolean;
};

export type OutboxItem = {
  /** Stable idempotency key, sent with every attempt. */
  id: string;
  labId: string;
  entity: SyncEntity;
  entityId: string;
  op: "upsert" | "delete";
  /** Version the device saw when it started editing; null = created on the device. */
  baseVersion: number | null;
  payload: unknown;
  createdAt: string;
  status: "pending" | "conflict" | "rejected";
  reason?: string;
  attempts: number;
};

export type PushResult =
  /** `serverId`: the id the server gave a report created on this device (the next pull brings the real row). */
  | { id: string; status: "applied"; version: number | null; serverId?: string }
  | { id: string; status: "conflict" | "rejected"; reason: string };

export interface SyncTransport {
  pull(since: number, limit: number): Promise<PullPage>;
  push(items: OutboxItem[]): Promise<PushResult[]>;
}

export interface LocalStore {
  getCursor(labId: string): Promise<number>;
  /** Atomic: save the page's rows/deletions AND move the cursor, or neither. */
  applyPage(labId: string, page: PullPage): Promise<void>;
  listOutbox(labId: string): Promise<OutboxItem[]>;
  putOutbox(item: OutboxItem): Promise<void>;
  removeOutbox(id: string): Promise<void>;
}

export const PULL_PAGE_SIZE = 200;
export const PUSH_BATCH_SIZE = 50;
const MAX_PAGES_PER_RUN = 1000;

export async function pullAll(
  store: LocalStore,
  transport: SyncTransport,
  labId: string,
  opts: { pageSize?: number; maxPages?: number } = {},
): Promise<{ pages: number; changes: number }> {
  const pageSize = opts.pageSize ?? PULL_PAGE_SIZE;
  const maxPages = opts.maxPages ?? MAX_PAGES_PER_RUN;
  let pages = 0;
  let changes = 0;
  while (pages < maxPages) {
    const since = await store.getCursor(labId);
    const page = await transport.pull(since, pageSize);
    // A page that claims more data but does not move the cursor would loop forever.
    if (page.hasMore && page.cursor <= since) throw new Error("SYNC_CURSOR_STUCK");
    await store.applyPage(labId, page);
    pages += 1;
    changes += page.changes.length;
    if (!page.hasMore) break;
  }
  return { pages, changes };
}

export async function pushOutbox(
  store: LocalStore,
  transport: SyncTransport,
  labId: string,
): Promise<{ sent: number; applied: number; conflicts: number; rejected: number }> {
  const pending = (await store.listOutbox(labId))
    .filter((i) => i.status === "pending")
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const out = { sent: 0, applied: 0, conflicts: 0, rejected: 0 };
  for (let i = 0; i < pending.length; i += PUSH_BATCH_SIZE) {
    const batch = pending.slice(i, i + PUSH_BATCH_SIZE);
    // Throws on a network failure: nothing below runs, the outbox is untouched.
    const results = await transport.push(batch);
    const byId = new Map(results.map((r) => [r.id, r]));
    for (const item of batch) {
      const result = byId.get(item.id);
      if (!result) continue; // no verdict: stays pending, retried next run
      out.sent += 1;
      if (result.status === "applied") {
        await store.removeOutbox(item.id);
        out.applied += 1;
      } else {
        await store.putOutbox({ ...item, status: result.status, reason: result.reason, attempts: item.attempts + 1 });
        if (result.status === "conflict") out.conflicts += 1;
        else out.rejected += 1;
      }
    }
  }
  return out;
}

export type SyncSummary =
  | { ok: true; push: Awaited<ReturnType<typeof pushOutbox>>; pull: Awaited<ReturnType<typeof pullAll>> }
  | { ok: false; offline: true; stage: "push" | "pull" };

/** Push local changes first, then pull. Being offline is a normal result, not an error. */
export async function syncOnce(store: LocalStore, transport: SyncTransport, labId: string): Promise<SyncSummary> {
  let stage: "push" | "pull" = "push";
  try {
    const push = await pushOutbox(store, transport, labId);
    stage = "pull";
    const pull = await pullAll(store, transport, labId);
    return { ok: true, push, pull };
  } catch (err) {
    if (isNetworkError(err)) return { ok: false, offline: true, stage };
    throw err;
  }
}

/** In-memory LocalStore: the test double, and a reference for the SQLite adapter. */
export function memoryLocalStore() {
  const cursors = new Map<string, number>();
  let tables: Record<SyncEntity, Map<string, Record<string, unknown>>> = emptyTables();
  let results = new Map<string, Record<string, unknown>[]>(); // reportId -> result rows
  const outbox = new Map<string, OutboxItem>();

  function emptyTables() {
    return {
      patients: new Map(),
      reports: new Map(),
      lab_test_catalog: new Map(),
      report_attachments: new Map(),
    } as Record<SyncEntity, Map<string, Record<string, unknown>>>;
  }

  const store: LocalStore & {
    getRow(entity: SyncEntity, id: string): Record<string, unknown> | undefined;
    listRows(entity: SyncEntity): Record<string, unknown>[];
    getResults(reportId: string): Record<string, unknown>[];
  } = {
    async getCursor(labId) {
      return cursors.get(labId) ?? 0;
    },
    async applyPage(labId, page) {
      // Work on copies and swap at the end, so a throw midway changes nothing.
      const next = emptyTables();
      for (const entity of Object.keys(tables) as SyncEntity[]) next[entity] = new Map(tables[entity]);
      const nextResults = new Map(results);
      const rowsById = (entity: SyncEntity) => new Map(page.rows[entity].map((r) => [String(r.id), r]));
      for (const change of page.changes) {
        if (change.op === "delete") {
          next[change.entity].delete(change.entityId);
          if (change.entity === "reports") nextResults.delete(change.entityId);
          continue;
        }
        // Row missing from the page = deleted since; its delete comes on a later page.
        const row = rowsById(change.entity).get(change.entityId);
        if (!row) continue;
        next[change.entity].set(change.entityId, structuredClone(row));
        if (change.entity === "reports") {
          nextResults.set(
            change.entityId,
            page.reportResults.filter((r) => String(r.report_id) === change.entityId).map((r) => structuredClone(r)),
          );
        }
      }
      tables = next;
      results = nextResults;
      cursors.set(labId, page.cursor);
    },
    async listOutbox(labId) {
      return [...outbox.values()].filter((i) => i.labId === labId).map((i) => structuredClone(i));
    },
    async putOutbox(item) {
      outbox.set(item.id, structuredClone(item));
    },
    async removeOutbox(id) {
      outbox.delete(id);
    },
    getRow: (entity, id) => tables[entity].get(id),
    listRows: (entity) => [...tables[entity].values()],
    getResults: (reportId) => results.get(reportId) ?? [],
  };
  return store;
}
