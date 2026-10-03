/**
 * Server-side rules for a change a device made while offline.
 * Pure: no imports besides a type, so it is tested in isolation and the same
 * rules can run on a lab's Windows hub.
 *
 * Principle (medical data): a device NEVER silently overwrites newer server
 * data. A stale edit is kept as a conflict for a person to resolve, and
 * anything past "draft" is locked against offline edits.
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
 * v1: only DRAFT reports can be written offline (the patient is created and
 * edited together with its report). Patients on their own, catalog and
 * attachments stay online-only.
 */
export const OFFLINE_WRITABLE: readonly SyncEntity[] = ["reports"];

export function decidePush(input: {
  entity: SyncEntity;
  op: PushOp;
  /** Version the device had when it started editing; null = the device created the row. */
  baseVersion: number | null;
  server: ServerRowInfo;
}): PushDecision {
  const { entity, op, baseVersion, server } = input;

  if (!OFFLINE_WRITABLE.includes(entity)) return { kind: "reject", reason: "not_supported_offline" };

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
  if (entity === "reports" && server.status !== "draft") return { kind: "reject", reason: "report_locked" };
  if (baseVersion === server.version) return { kind: "apply" };
  return { kind: "conflict", reason: baseVersion < server.version ? "server_newer" : "version_mismatch" };
}
