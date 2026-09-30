/**
 * Outbox for reports created without a connection.
 *
 * Pure logic on top of a tiny storage interface, so it runs the same against
 * IndexedDB in the browser and an in-memory map in tests. No DOM, no imports.
 *
 * Guarantees:
 *  - items are sent oldest-first, one at a time;
 *  - a network failure stops the run and leaves everything queued;
 *  - a server rejection marks only that item "failed" (kept for the user to
 *    fix or delete) and the run continues;
 *  - each item carries a stable requestId, which the server uses to make the
 *    create idempotent — a retry after a lost response cannot duplicate.
 */

export interface QueuedReport<P = unknown> {
  id: string; // == requestId sent to the server
  labId: string;
  createdAt: string; // ISO, when the report was entered on the device
  label: string; // patient name, for the list UI
  payload: P;
  status: "pending" | "failed";
  attempts: number;
  lastError?: string;
}

export interface QueueStore<P = unknown> {
  list(): Promise<QueuedReport<P>[]>;
  put(item: QueuedReport<P>): Promise<void>;
  remove(id: string): Promise<void>;
}

export function memoryStore<P = unknown>(): QueueStore<P> {
  const map = new Map<string, QueuedReport<P>>();
  return {
    async list() {
      return [...map.values()].map((v) => structuredClone(v));
    },
    async put(item) {
      map.set(item.id, structuredClone(item));
    },
    async remove(id) {
      map.delete(id);
    },
  };
}

export async function enqueue<P>(
  store: QueueStore<P>,
  input: { id: string; labId: string; label: string; payload: P; createdAt?: string },
): Promise<QueuedReport<P>> {
  const item: QueuedReport<P> = {
    id: input.id,
    labId: input.labId,
    createdAt: input.createdAt ?? new Date().toISOString(),
    label: input.label,
    payload: input.payload,
    status: "pending",
    attempts: 0,
  };
  await store.put(item);
  return item;
}

export async function listForLab<P>(store: QueueStore<P>, labId: string | null): Promise<QueuedReport<P>[]> {
  if (!labId) return [];
  const all = await store.list();
  return all.filter((i) => i.labId === labId).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export interface FlushResult {
  sent: number;
  failed: number;
  /** True when the run stopped because the network was unavailable. */
  offline: boolean;
}

export async function flush<P>(
  store: QueueStore<P>,
  labId: string,
  send: (item: QueuedReport<P>) => Promise<unknown>,
  isNetworkError: (err: unknown) => boolean,
): Promise<FlushResult> {
  const items = (await listForLab(store, labId)).filter((i) => i.status === "pending");
  const result: FlushResult = { sent: 0, failed: 0, offline: false };

  for (const item of items) {
    try {
      await send(item);
      await store.remove(item.id);
      result.sent += 1;
    } catch (err) {
      if (isNetworkError(err)) {
        result.offline = true;
        break;
      }
      await store.put({
        ...item,
        status: "failed",
        attempts: item.attempts + 1,
        lastError: err instanceof Error ? err.message : String(err),
      });
      result.failed += 1;
    }
  }
  return result;
}

/** Put a failed item back in line (e.g. after the user fixed the cause). */
export async function retry<P>(store: QueueStore<P>, id: string): Promise<void> {
  const item = (await store.list()).find((i) => i.id === id);
  if (item) await store.put({ ...item, status: "pending", lastError: undefined });
}
