/**
 * Browser-side actions on the outbox: queue an offline edit of a draft report.
 * The pure parts (what the item looks like, which item is pending/blocked) live
 * in edit-item.ts and are tested; this file only reads and writes IndexedDB.
 */
import { newRequestId } from "../offline/sync";
import { reapplyItem } from "./conflict-review";
import { buildEditItem, buildPatientCreateItem, outboxStateFor, type CatalogEditPayload, type NewPatientPayload } from "./edit-item";
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

/**
 * Save a patient added with no connection; it is sent on the next sync (which runs right away if the
 * connection is actually back). Returns the id the patient has on this device until the server gives the real one.
 */
export async function queuePatientCreate(input: { labId: string; payload: NewPatientPayload }): Promise<{ localId: string }> {
  const item = buildPatientCreateItem({ labId: input.labId, payload: input.payload, now: new Date().toISOString(), newId: newRequestId() });
  await idbLocalStore().putOutbox(item);
  void syncRunner.syncNow();
  return { localId: item.entityId };
}

/**
 * Save an edit of a catalog test on this device; it is sent on the next sync. One pending edit per test:
 * saving again replaces it and keeps the version the person originally started from. If the device has no
 * pulled copy of the test, or an earlier edit of it was refused and nobody resolved it, it cannot be queued.
 */
export async function queueCatalogEdit(input: { labId: string; itemId: string; payload: CatalogEditPayload }): Promise<void> {
  const store = idbLocalStore();
  const { pending, blocked } = outboxStateFor(await store.listOutbox(input.labId), input.itemId, "lab_test_catalog");
  if (blocked) throw new Error(EDIT_BLOCKED);
  let baseVersion = 0;
  if (!pending) {
    const row = await store.getRow("lab_test_catalog", input.itemId);
    const v = row ? Number(row.version) : NaN;
    if (!Number.isFinite(v)) throw new Error("NO_LOCAL_COPY_OF_ITEM");
    baseVersion = v;
  }
  await store.putOutbox(
    buildEditItem(pending, { labId: input.labId, reportId: input.itemId, baseVersion, payload: input.payload, now: new Date().toISOString(), newId: newRequestId(), entity: "lab_test_catalog" }),
  );
  void syncRunner.syncNow();
}

/** "Keep the server's version": drop the device's edit for good. Callers confirm with the person first. */
export async function discardChange(itemId: string): Promise<void> {
  await idbLocalStore().removeOutbox(itemId);
}

export type ReapplyResult = "queued" | "no_local_copy" | "not_a_draft";

/**
 * "Apply my edit on top of the new version": pull first so the base is the
 * server's current version, then put the same edit back in the queue against it.
 * Only a report that is not cancelled can take it.
 */
export async function reapplyChange(item: OutboxItem): Promise<ReapplyResult> {
  await syncRunner.syncNow(); // no-op offline; the copy is then as fresh as it was
  const store = idbLocalStore();
  const row = await store.getRow(item.entity, item.entityId);
  if (!row) return "no_local_copy";
  if (item.entity === "reports" && row.status === "cancelled") return "not_a_draft"; // result code kept for the sync screen: the report was cancelled
  await store.putOutbox(reapplyItem(item, Number(row.version)));
  void syncRunner.syncNow();
  return "queued";
}
