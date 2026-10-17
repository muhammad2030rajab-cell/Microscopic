/**
 * Server-side rules for a change a device made while offline.
 * Pure: no imports besides a type, so it is tested in isolation and the same
 * rules can run on a lab's Windows hub.
 *
 * Principle (medical data): a device NEVER silently overwrites newer server
 * data. A stale edit is kept as a conflict for a person to resolve, and
 * a cancelled report is locked against offline edits, and deleting a report always needs a person online.
 */
import type { SyncEntity } from "../sync-shared.ts";

export type PushOp = "upsert" | "delete";

/** What the server currently holds for the row (null = no such row). */
export type ServerRowInfo = { version: number; status?: string } | null;

export type PushDecision =
  | { kind: "apply" }
  /** A retry of a create that already landed, or a delete of an already-gone row. Report success, change nothing. */
  | { kind: "already_applied" }
  | { kind: "conflict"; reason: "server_newer" | "deleted_on_server" | "version_mismatch" }
  | { kind: "reject"; reason: "report_locked" | "not_supported_offline" | "requires_online" };

/**
 * Offline writes: DRAFT reports (the patient is created and edited together with
 * its report), a NEW patient added on its own, and an EDIT of an existing catalog
 * test. Editing or deleting a patient, creating or deleting catalog tests, and
 * attachments stay online-only.
 */
export const OFFLINE_WRITABLE: readonly SyncEntity[] = ["reports", "patients", "lab_test_catalog"];

export function decidePush(input: {
  entity: SyncEntity;
  op: PushOp;
  /** Version the device had when it started editing; null = the device created the row. */
  baseVersion: number | null;
  server: ServerRowInfo;
}): PushDecision {
  const { entity, op, baseVersion, server } = input;

  if (!OFFLINE_WRITABLE.includes(entity)) return { kind: "reject", reason: "not_supported_offline" };
  // A patient can only be CREATED offline: no edit of an existing patient, no delete.
  if (entity === "patients" && (op !== "upsert" || baseVersion !== null)) return { kind: "reject", reason: "not_supported_offline" };
  // A catalog test can only be EDITED offline (it must exist and the device must know which version it started from).
  if (entity === "lab_test_catalog" && (op !== "upsert" || baseVersion === null)) return { kind: "reject", reason: "not_supported_offline" };

  if (op === "delete") {
    if (!server) return { kind: "already_applied" };
    // Deleting a report past draft needs a person online with the strong warning.
    if (server.status !== "draft") return { kind: "reject", reason: "requires_online" };
    if (baseVersion === server.version) return { kind: "apply" };
    return { kind: "conflict", reason: baseVersion !== null && baseVersion < server.version ? "server_newer" : "version_mismatch" };
  }

  // upsert
  if (!server) {
    return baseVersion === null ? { kind: "apply" } : { kind: "conflict", reason: "deleted_on_server" };
  }
  // The device thinks it is creating a row the server already has: a retry. Never overwrite.
  if (baseVersion === null) return { kind: "already_applied" };
  if (entity === "reports" && server.status === "cancelled") return { kind: "reject", reason: "report_locked" };
  if (baseVersion === server.version) return { kind: "apply" };
  return { kind: "conflict", reason: baseVersion < server.version ? "server_newer" : "version_mismatch" };
}

/** What the server remembers about a change id it already applied (null = never seen). */
export type AppliedRecord = { resultVersion: number | null; payloadHash: string } | null;

export type Reconciled =
  /** Same change arrived again (the reply was lost). Answer "applied" with the version it produced; write nothing. */
  | { kind: "already_applied"; version: number | null }
  /** Decide normally, against this base version. */
  | { kind: "proceed"; baseVersion: number | null };

/**
 * Run BEFORE decidePush. Same id + same content = a retry. Same id + different
 * content = the device edited again before it heard back, so the new content
 * builds on the version its own earlier write produced — never conflicts with
 * itself. Someone else's change in between still conflicts (decidePush compares
 * against the server's real version).
 */
export function reconcileWithApplied(applied: AppliedRecord, incoming: { baseVersion: number | null; payloadHash: string }): Reconciled {
  if (!applied) return { kind: "proceed", baseVersion: incoming.baseVersion };
  if (applied.payloadHash === incoming.payloadHash) return { kind: "already_applied", version: applied.resultVersion };
  return { kind: "proceed", baseVersion: applied.resultVersion ?? incoming.baseVersion };
}
