import assert from "node:assert/strict";
import { test } from "node:test";
import {
  SYNC_PAGE_DEFAULT,
  SYNC_PAGE_MAX,
  clampSyncLimit,
  collapseChanges,
  isSyncEntity,
  MAX_OFFLINE_DAYS,
  PUSH_BATCH_MAX,
  isMirrorFresh,
  parsePushBatch,
  parseSyncCursor,
  type RawSyncChange,
} from "./sync-shared.ts";

const change = (seq: number, entity: string, id: string, op: "upsert" | "delete" = "upsert", version: number | null = 1): RawSyncChange => ({
  seq, entity, entity_id: id, op, version,
});

test("cursor: whole non-negative numbers pass, anything else restarts at 0", () => {
  assert.equal(parseSyncCursor(42), 42);
  assert.equal(parseSyncCursor("42"), 42);
  for (const bad of [undefined, null, "", "abc", -5, 1.5, NaN, Infinity, {}, [], "1e400"]) {
    assert.equal(parseSyncCursor(bad), 0, String(bad));
  }
});

test("limit: defaults and is clamped to 1..max", () => {
  assert.equal(clampSyncLimit(undefined), SYNC_PAGE_DEFAULT);
  assert.equal(clampSyncLimit("10"), SYNC_PAGE_DEFAULT);
  assert.equal(clampSyncLimit(0), 1);
  assert.equal(clampSyncLimit(-3), 1);
  assert.equal(clampSyncLimit(10_000), SYNC_PAGE_MAX);
  assert.equal(clampSyncLimit(25.9), 25);
});

test("entity whitelist rejects anything that is not a synced table", () => {
  assert.equal(isSyncEntity("patients"), true);
  assert.equal(isSyncEntity("reports"), true);
  for (const bad of ["users", "labs", "audit_logs", "patients; drop table patients", "", null, 3]) {
    assert.equal(isSyncEntity(bad), false, String(bad));
  }
});

test("collapse keeps only the latest change per row, in seq order", () => {
  const out = collapseChanges([
    change(1, "reports", "a", "upsert", 1),
    change(2, "patients", "p", "upsert", 1),
    change(3, "reports", "a", "upsert", 2),
    change(4, "reports", "a", "upsert", 3),
  ]);
  assert.deepEqual(out.map((c) => [c.seq, c.entity, c.entity_id, c.version]), [
    [2, "patients", "p", 1],
    [4, "reports", "a", 3],
  ]);
});

test("collapse: a row created then deleted ends as a delete", () => {
  const out = collapseChanges([change(1, "reports", "a"), change(2, "reports", "a", "delete", null)]);
  assert.equal(out.length, 1);
  assert.equal(out[0].op, "delete");
});

test("collapse: same id in different tables stays separate; seq arrives as number even if it was a string", () => {
  const out = collapseChanges([change(1, "reports", "x"), { ...change(2, "patients", "x"), seq: "2" as unknown as number }]);
  assert.equal(out.length, 2);
  assert.equal(typeof out[1].seq, "number");
});

test("collapse: empty page", () => {
  assert.deepEqual(collapseChanges([]), []);
});

const good = { id: "c1", entity: "reports", entityId: "r1", op: "upsert", baseVersion: null, payload: { a: 1 } };

test("push batch: a valid batch passes through", () => {
  const out = parsePushBatch({ changes: [good, { ...good, id: "c2", baseVersion: 3 }] });
  assert.equal(out.length, 2);
  assert.equal(out[1].baseVersion, 3);
});

test("push batch: anything malformed refuses the whole batch", () => {
  const bad: unknown[] = [
    undefined, null, {}, { changes: "x" },
    { changes: [{ ...good, entity: "users" }] },
    { changes: [{ ...good, entity: "patients; drop table x" }] },
    { changes: [{ ...good, op: "update" }] },
    { changes: [{ ...good, id: "" }] },
    { changes: [{ ...good, id: "x".repeat(65) }] },
    { changes: [{ ...good, entityId: 5 }] },
    { changes: [{ ...good, baseVersion: -1 }] },
    { changes: [{ ...good, baseVersion: 1.5 }] },
    { changes: [{ ...good, baseVersion: "2" }] },
    { changes: [good, null] },
  ];
  for (const b of bad) assert.throws(() => parsePushBatch(b), /PUSH_BATCH_INVALID/, JSON.stringify(b));
});

test("push batch: size cap and duplicate ids", () => {
  const many = Array.from({ length: PUSH_BATCH_MAX + 1 }, (_, i) => ({ ...good, id: `c${i}` }));
  assert.throws(() => parsePushBatch({ changes: many }), /PUSH_BATCH_TOO_LARGE/);
  assert.throws(() => parsePushBatch({ changes: [good, good] }), /PUSH_BATCH_DUPLICATE_ID/);
  assert.equal(parsePushBatch({ changes: [] }).length, 0);
});

test("device copy freshness: recent shows; old, missing, zero and future timestamps do not", () => {
  const now = 1_000_000_000_000;
  const day = 86_400_000;
  assert.equal(isMirrorFresh(now - day, now), true);
  assert.equal(isMirrorFresh(now - MAX_OFFLINE_DAYS * day, now), true);
  assert.equal(isMirrorFresh(now - MAX_OFFLINE_DAYS * day - 1, now), false);
  for (const bad of [undefined, null, 0, -5, NaN, "x"]) assert.equal(isMirrorFresh(bad, now), false, String(bad));
  assert.equal(isMirrorFresh(now + day, now), false);
});
