/**
 * LocalStore on IndexedDB: what the Android app (a TWA, i.e. Chrome) and any
 * browser use to keep a lab's data on the device. Browser-only.
 *
 * Mirrors `memoryLocalStore` in engine.ts (which IS tested) — keep the two in
 * step. The one thing that matters most: `applyPage` writes rows, deletions and
 * the cursor in ONE IndexedDB transaction, so it either all lands or none does.
 */
import type { SyncEntity } from "../sync-shared.ts";
import type { LocalStore, OutboxItem, PullPage } from "./engine.ts";

const DB_NAME = "microscopic-sync";
const DB_VERSION = 1;
const ENTITY_STORES: SyncEntity[] = ["patients", "reports", "lab_test_catalog", "report_attachments"];
const S_RESULTS = "report_results";
const S_OUTBOX = "outbox";
const S_META = "meta";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const name of ENTITY_STORES) db.createObjectStore(name, { keyPath: "id" });
      db.createObjectStore(S_RESULTS, { keyPath: "id" }).createIndex("by_report", "report_id");
      db.createObjectStore(S_OUTBOX, { keyPath: "id" }).createIndex("by_lab", "labId");
      db.createObjectStore(S_META, { keyPath: "key" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

const wrap = <T>(req: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error("IDB_TX_ABORTED"));
  });
}

export function idbLocalStore() {
  let dbPromise: Promise<IDBDatabase> | null = null;
  const db = () => (dbPromise ??= openDb());

  const store: LocalStore & {
    getRow(entity: SyncEntity, id: string): Promise<Record<string, unknown> | undefined>;
    listRows(entity: SyncEntity): Promise<Record<string, unknown>[]>;
    getResults(reportId: string): Promise<Record<string, unknown>[]>;
    /** Epoch ms of the last successful pull for this lab (0 = never). */
    getLastSync(labId: string): Promise<number>;
    /** Every result row (the archive list needs counts for all reports in one read). */
    listAllResults(): Promise<Record<string, unknown>[]>;
    /** Sign-out: drop the copy of the lab's data and cursors, KEEP the outbox (work not yet sent must not be lost). */
    clearMirror(): Promise<void>;
    /** Full reset, outbox included. */
    clearAll(): Promise<void>;
  } = {
    async getCursor(labId) {
      const d = await db();
      const row = await wrap(d.transaction(S_META).objectStore(S_META).get(`cursor:${labId}`));
      return typeof row?.value === "number" ? row.value : 0;
    },

    async applyPage(labId, page: PullPage) {
      const d = await db();
      const tx = d.transaction([...ENTITY_STORES, S_RESULTS, S_META], "readwrite");
      const done = txDone(tx);
      const resultsStore = tx.objectStore(S_RESULTS);
      const resultsIndex = resultsStore.index("by_report");

      const dropResults = async (reportId: string) => {
        const keys = await wrap(resultsIndex.getAllKeys(IDBKeyRange.only(reportId)));
        for (const k of keys) resultsStore.delete(k);
      };

      try {
        for (const change of page.changes) {
          const rows = tx.objectStore(change.entity);
          if (change.op === "delete") {
            rows.delete(change.entityId);
            if (change.entity === "reports") await dropResults(change.entityId);
            continue;
          }
          // Row missing from the page = deleted since; its delete arrives on a later page.
          const row = page.rows[change.entity].find((r) => String(r.id) === change.entityId);
          if (!row) continue;
          rows.put(row);
          if (change.entity === "reports") {
            await dropResults(change.entityId);
            for (const r of page.reportResults) if (String(r.report_id) === change.entityId) resultsStore.put(r);
          }
        }
        tx.objectStore(S_META).put({ key: `cursor:${labId}`, value: page.cursor });
        // Read by /offline.html and the in-app fallbacks: a copy nobody refreshed for weeks is not shown.
        tx.objectStore(S_META).put({ key: `lastSync:${labId}`, value: Date.now() });
      } catch (err) {
        tx.abort(); // nothing from this page — including the cursor — is kept
        await done.catch(() => undefined);
        throw err;
      }
      await done;
    },

    async getLastSync(labId) {
      const d = await db();
      const row = await wrap(d.transaction(S_META).objectStore(S_META).get(`lastSync:${labId}`));
      return typeof row?.value === "number" ? row.value : 0;
    },

    async listOutbox(labId) {
      const d = await db();
      return wrap<OutboxItem[]>(d.transaction(S_OUTBOX).objectStore(S_OUTBOX).index("by_lab").getAll(IDBKeyRange.only(labId)));
    },
    async putOutbox(item) {
      const d = await db();
      const tx = d.transaction(S_OUTBOX, "readwrite");
      tx.objectStore(S_OUTBOX).put(item);
      await txDone(tx);
    },
    async removeOutbox(id) {
      const d = await db();
      const tx = d.transaction(S_OUTBOX, "readwrite");
      tx.objectStore(S_OUTBOX).delete(id);
      await txDone(tx);
    },

    async getRow(entity, id) {
      const d = await db();
      return wrap(d.transaction(entity).objectStore(entity).get(id));
    },
    async listRows(entity) {
      const d = await db();
      return wrap(d.transaction(entity).objectStore(entity).getAll());
    },
    async getResults(reportId) {
      const d = await db();
      const rows = await wrap<Record<string, unknown>[]>(
        d.transaction(S_RESULTS).objectStore(S_RESULTS).index("by_report").getAll(IDBKeyRange.only(reportId)),
      );
      return rows.sort((a, b) => Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0));
    },
    async listAllResults() {
      const d = await db();
      return wrap(d.transaction(S_RESULTS).objectStore(S_RESULTS).getAll());
    },
    async clearMirror() {
      const d = await db();
      const names = [...ENTITY_STORES, S_RESULTS, S_META];
      const tx = d.transaction(names, "readwrite");
      for (const n of names) tx.objectStore(n).clear();
      await txDone(tx);
    },
    async clearAll() {
      const d = await db();
      const names = [...ENTITY_STORES, S_RESULTS, S_OUTBOX, S_META];
      const tx = d.transaction(names, "readwrite");
      for (const n of names) tx.objectStore(n).clear();
      await txDone(tx);
    },
  };
  return store;
}

/**
 * Ask the browser not to evict this site's data under storage pressure.
 * Without it Chrome may delete IndexedDB on a low-storage phone — fatal when a
 * lab has days of unsynced work. Call once after sign-in; returns whether the
 * data is protected (the app should warn the user when it is not).
 */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (typeof navigator === "undefined" || !navigator.storage?.persist) return false;
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}
