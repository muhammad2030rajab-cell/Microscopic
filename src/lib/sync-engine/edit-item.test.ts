import assert from "node:assert/strict";
import { test } from "node:test";
import { buildEditItem, buildPatientCreateItem, outboxStateFor, overlayCatalogEdits, pendingPatientRows } from "./edit-item.ts";
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

const newPatient = { fullName: "  منى أحمد ", patientCode: "p-7", age: 25, ageUnit: "years", gender: "أنثى" as const, phone: "010-1234-5678", notes: "  " };

test("a patient added offline is a pending create: no base version, the item id is also its local id", () => {
  const created = buildPatientCreateItem({ labId: "L", payload: newPatient, now: "2026-10-17T10:00:00.000Z", newId: "req-1" });
  assert.equal(created.entity, "patients");
  assert.equal(created.op, "upsert");
  assert.equal(created.baseVersion, null);
  assert.equal(created.status, "pending");
  assert.equal(created.id, "req-1");
  assert.equal(created.entityId, "req-1");
  assert.equal(created.attempts, 0);
});

test("pending patients show up like pulled rows; refused, other-lab and non-patient items do not", () => {
  const mine = buildPatientCreateItem({ labId: "L", payload: newPatient, now: "2026-10-17T10:00:00.000Z", newId: "req-1" });
  const rows = pendingPatientRows(
    [
      mine,
      { ...mine, id: "req-2", entityId: "req-2", status: "rejected" },
      { ...mine, id: "req-3", entityId: "req-3", status: "conflict" },
      { ...mine, id: "req-4", entityId: "req-4", labId: "OTHER" },
      item(), // a report edit
    ],
    "L",
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].id, "req-1");
  assert.equal(rows[0].lab_id, "L");
  assert.equal(rows[0].full_name, "منى أحمد");
  assert.equal(rows[0].patient_code, "P-7");
  assert.equal(rows[0].age, 25);
  assert.equal(rows[0].gender, "أنثى");
  assert.equal(rows[0].phone, "01012345678"); // digits only
  assert.equal(rows[0].notes, null); // blank notes are not kept
});

test("a patient item does not count as an edit of any report", () => {
  const created = buildPatientCreateItem({ labId: "L", payload: newPatient, now: "2026-10-17T10:00:00.000Z", newId: "r1" });
  assert.deepEqual(outboxStateFor([created], "r1"), { pending: undefined, blocked: undefined });
});

const catalogItem = (over: Partial<OutboxItem> = {}): OutboxItem => ({
  id: "c-req", labId: "L", entity: "lab_test_catalog", entityId: "t1", op: "upsert", baseVersion: 2,
  payload: { unit: "g/dL", maleRange: "13-17", femaleRange: "12-16", ageRanges: "  ", isActive: false, testName: "Hb" },
  createdAt: "2026-10-17T09:00:00.000Z", status: "pending", attempts: 0, ...over,
});

test("a catalog edit is its own item, separate from a report with the same id", () => {
  const built = buildEditItem(undefined, { labId: "L", reportId: "t1", baseVersion: 2, payload: { n: 1 }, now: "2026-10-17T10:00:00.000Z", newId: "x", entity: "lab_test_catalog" });
  assert.equal(built.entity, "lab_test_catalog");
  assert.equal(built.baseVersion, 2);
  const items = [catalogItem(), item({ entityId: "t1" })];
  assert.equal(outboxStateFor(items, "t1", "lab_test_catalog").pending?.id, "c-req");
  assert.equal(outboxStateFor(items, "t1").pending?.id, "old-id"); // default is still reports
});

test("saving a catalog test again replaces the unsent edit and keeps its id and base version", () => {
  const again = buildEditItem(catalogItem(), { labId: "L", reportId: "t1", baseVersion: 9, payload: { unit: "x" }, now: "2026-10-17T11:00:00.000Z", newId: "other", entity: "lab_test_catalog" });
  assert.equal(again.id, "c-req");
  assert.equal(again.baseVersion, 2);
  assert.deepEqual(again.payload, { unit: "x" });
});

test("unsent catalog edits are shown on top of the pulled rows; refused ones and other labs are not", () => {
  const rows = [
    { id: "t1", lab_id: "L", unit: "old", male_range: "1", female_range: "2", age_ranges: "a", is_active: true },
    { id: "t2", lab_id: "L", unit: "u2", male_range: "3", female_range: "4", age_ranges: null, is_active: true },
  ];
  const out = overlayCatalogEdits(rows, [catalogItem(), catalogItem({ id: "r2", entityId: "t2", status: "conflict" }), catalogItem({ id: "r3", entityId: "t2", labId: "OTHER" })], "L");
  assert.deepEqual(out[0], { id: "t1", lab_id: "L", unit: "g/dL", male_range: "13-17", female_range: "12-16", age_ranges: null, is_active: false });
  assert.deepEqual(out[1], rows[1]);
  assert.equal(overlayCatalogEdits(rows, [], "L"), rows); // nothing pending: same rows back
});
