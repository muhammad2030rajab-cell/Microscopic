import assert from "node:assert/strict";
import { test } from "node:test";
import {
  SYNC_PAGE_DEFAULT,
  SYNC_PAGE_MAX,
  clampSyncLimit,
  collapseChanges,
  isSyncEntity,
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
