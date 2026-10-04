/**
 * Browser-side actions on the outbox: queue an offline edit of a draft report.
 * The pure parts (what the item looks like, which item is pending/blocked) live
 * in edit-item.ts and are tested; this file only reads and writes IndexedDB.
 */
import { newRequestId } from "../offline/sync";
import { reapplyItem } from "./conflict-review";
import { buildEditItem, outboxStateFor } from "./edit-item";
import type { OutboxItem } from "./engine";
import { idbLocalStore } from "./idb-local-store";
import { syncRunner } from "./runner";

/** Thrown when an earlier edit of this report was refused by the server and no one has dealt with it yet. */
export const EDIT_BLOCKED = "EDIT_BLOCKED_BY_UNRESOLVED_CHANGE";

/**
 * Save an edit of a draft report on this device; it is sent on the next sync.
 * `baseVersion` is the version of the pulled copy the person started from. If
 * the device has no pulled copy of the report, the edit cannot be queued safely.
 */
export async function queueReportEdit(input: { labId: string; reportId: string; payload: unknown; baseVersion?: number }): Promise<void> {
  const store = idbLocalStore();
  const { pending, blocked } = outboxStateFor(await store.listOutbox(input.labId), input.reportId);
  if (blocked) throw new Error(EDIT_BLOCKED);

  let baseVersion = input.baseVersion;
  if (baseVersion === undefined) {
    const row = await store.getRow("reports", input.reportId);
    baseVersion = row ? Number(row.version) : undefined;
  }
  if (!pending && (baseVersion === undefined || !Number.isFinite(baseVersion))) throw new Error("NO_LOCAL_COPY_OF_REPORT");

  await store.putOutbox(
    buildEditItem(pending, {
      labId: input.labId,
      reportId: input.reportId,
      baseVersion: baseVersion ?? 0,
      payload: input.payload,
      now: new Date().toISOString(),
      newId: newRequestId(),
    }),
  );
  void syncRunner.syncNow(); // sends it right away if the connection is actually back
}

/** "Keep the server's version": drop the device's edit for good. Callers confirm with the person first. */
export async function discardChange(itemId: string): Promise<void> {
  await idbLocalStore().removeOutbox(itemId);
}

export type ReapplyResult = "queued" | "no_local_copy" | "not_a_draft";

/**
 * "Apply my edit on top of the new version": pull first so the base is the
 * server's current version, then put the same edit back in the queue against it.
 * Only a report that is still a draft can take it.
 */
export async function reapplyChange(item: OutboxItem): Promise<ReapplyResult> {
  await syncRunner.syncNow(); // no-op offline; the copy is then as fresh as it was
  const store = idbLocalStore();
  const row = await store.getRow("reports", item.entityId);
  if (!row) return "no_local_copy";
  if (row.status !== "draft") return "not_a_draft";
  await store.putOutbox(reapplyItem(item, Number(row.version)));
  void syncRunner.syncNow();
  return "queued";
}
