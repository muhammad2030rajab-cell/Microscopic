/**
 * Builds the outbox item for an offline edit of a draft report. Pure.
 *
 * One pending item per report: editing again REPLACES the content of the one
 * that has not been sent, keeping its id (the id is the server's idempotency
 * key — see reconcileWithApplied) and its original base version.
 */
import type { OutboxItem } from "./engine.ts";

export function buildEditItem(
  existing: OutboxItem | undefined,
  input: { labId: string; reportId: string; baseVersion: number; payload: unknown; now: string; newId: string },
): OutboxItem {
  // Only an unsent item may be rewritten. A conflict/rejected one needs a person first (see queueReportEdit).
  if (existing && existing.status === "pending") return { ...existing, payload: input.payload };
  return {
    id: input.newId,
    labId: input.labId,
    entity: "reports",
    entityId: input.reportId,
    op: "upsert",
    baseVersion: input.baseVersion,
    payload: input.payload,
    createdAt: input.now,
    status: "pending",
    attempts: 0,
  };
}

/** The report's items in the outbox: the unsent one, and any that the server refused. */
export function outboxStateFor(items: OutboxItem[], reportId: string): { pending?: OutboxItem; blocked?: OutboxItem } {
  const mine = items.filter((i) => i.entity === "reports" && i.entityId === reportId);
  return { pending: mine.find((i) => i.status === "pending"), blocked: mine.find((i) => i.status !== "pending") };
}
