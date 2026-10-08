import assert from "node:assert/strict";
import test from "node:test";
import { backupAge } from "./backup-age.ts";

const NOW = Date.parse("2026-10-08T12:00:00Z");
const ago = (days: number, extraHours = 0) => new Date(NOW - days * 86_400_000 - extraHours * 3_600_000).toISOString();

test("no backup yet, or an unreadable date, counts as never", () => {
  assert.deepEqual(backupAge(null, NOW), { state: "never" });
  assert.deepEqual(backupAge("not a date", NOW), { state: "never" });
});

test("fresh under 7 days, stale from 7 days", () => {
  assert.deepEqual(backupAge(ago(0), NOW), { state: "fresh", days: 0 });
  assert.deepEqual(backupAge(ago(6, 23), NOW), { state: "fresh", days: 6 });
  assert.deepEqual(backupAge(ago(7), NOW), { state: "stale", days: 7 });
  assert.deepEqual(backupAge(ago(30), NOW), { state: "stale", days: 30 });
});

test("a clock a little ahead never gives negative days", () => {
  assert.deepEqual(backupAge(new Date(NOW + 3_600_000).toISOString(), NOW), { state: "fresh", days: 0 });
});
