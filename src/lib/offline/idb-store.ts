import type { QueuedReport, QueueStore } from "./queue";

const DB_NAME = "rajab-offline";
const STORE = "reports";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE, { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(STORE, mode);
        const req = fn(tx.objectStore(STORE));
        tx.oncomplete = () => {
          db.close();
          resolve(req.result);
        };
        tx.onerror = tx.onabort = () => {
          db.close();
          reject(tx.error);
        };
      }),
  );
}

/** Browser-only. Throws if IndexedDB is unavailable (callers surface that). */
export function idbStore<P = unknown>(): QueueStore<P> {
  return {
    list: () => run<QueuedReport<P>[]>("readonly", (s) => s.getAll()),
    put: (item) => run("readwrite", (s) => s.put(item)).then(() => undefined),
    remove: (id) => run("readwrite", (s) => s.delete(id)).then(() => undefined),
  };
}
