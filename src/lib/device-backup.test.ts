import test from "node:test";
import assert from "node:assert/strict";
import { BACKUP_FORMAT, buildBackup } from "./device-backup.ts";

const tables = {
  patients: [{ id: "p1" }, { id: "p2" }],
  reports: [{ id: "r1" }],
  report_results: [{ id: "x1" }, { id: "x2" }, { id: "x3" }],
  lab_test_catalog: [{ id: "c1" }],
  outbox: [],
};

test("counts every table and names the file by date and time", () => {
  const b = buildBackup(tables, new Date(2026, 9, 6, 9, 5));
  assert.deepEqual(b.counts, { patients: 2, reports: 1, results: 3, catalog: 1, unsent: 0 });
  assert.equal(b.filename, "microscopic-backup-2026-10-06_0905.json");
});

test("the file is valid JSON that carries the format marker and all tables", () => {
  const parsed = JSON.parse(buildBackup(tables).json);
  assert.equal(parsed.format, BACKUP_FORMAT);
  assert.equal(parsed.version, 1);
  assert.equal(parsed.tables.patients.length, 2);
});

test("a missing table counts as zero instead of failing", () => {
  const b = buildBackup({ patients: [{ id: "p" }] });
  assert.equal(b.counts.reports, 0);
  assert.equal(b.counts.unsent, 0);
});
