import assert from "node:assert/strict";
import { test } from "node:test";
import { buildEditItem, outboxStateFor } from "./edit-item.ts";
import type { OutboxItem } from "./engine.ts";

const input = { labId: "L", reportId: "r1", baseVersion: 3, payload: { n: 1 }, now: "2026-10-04T10:00:00.000Z", newId: "new-id" };
const item = (over: Partial<OutboxItem> = {}): OutboxItem => ({
  id: "old-id", labId: "L", entity: "reports", entityId: "r1", op: "upsert", baseVersion: 3, payload: { n: 0 },
  createdAt: "2026-10-04T09:00:00.000Z", status: "pending", attempts: 0, ...over,
});

test("first offline edit creates a pending upsert based on the pulled version", () => {
  const out = buildEditItem(undefined, input);
  assert.deepEqual(
    [out.id, out.entity, out.entityId, out.op, out.baseVersion, out.status, out.attempts],
    ["new-id", "reports", "r1", "upsert", 3, "pending", 0],
  );
  assert.deepEqual(out.payload, { n: 1 });
});

test("editing again replaces the content but keeps id, base version and order", () => {
  const out = buildEditItem(item(), { ...input, baseVersion: 99, payload: { n: 2 } });
  assert.equal(out.id, "old-id");
  assert.equal(out.baseVersion, 3); // NOT the new one: the server still holds version 3 + our unsent change
  assert.equal(out.createdAt, "2026-10-04T09:00:00.000Z");
  assert.deepEqual(out.payload, { n: 2 });
});

test("a refused item is never silently rewritten", () => {
  const out = buildEditItem(item({ status: "conflict", reason: "server_newer" }), input);
  assert.equal(out.id, "new-id");
  assert.equal(out.status, "pending");
});

test("outbox state per report: pending and blocked are told apart, other reports ignored", () => {
  const items = [item(), item({ id: "x", status: "rejected" }), item({ id: "other", entityId: "r2" })];
  const s = outboxStateFor(items, "r1");
  assert.equal(s.pending?.id, "old-id");
  assert.equal(s.blocked?.id, "x");
  assert.deepEqual(outboxStateFor(items, "r3"), { pending: undefined, blocked: undefined });
});
