import assert from "node:assert/strict";
import { test } from "node:test";
import { canReapply, describeReason, diffReportEdit, reapplyItem } from "./conflict-review.ts";
import type { OutboxItem } from "./engine.ts";
import type { LocalReportDetail } from "./local-reads.ts";

const server = (): LocalReportDetail => ({
  id: "r1", patientName: "منى أحمد", patientCode: "P-1", age: 25, ageUnit: "years", gender: "أنثى", phone: "0101", nationalId: undefined,
  sampleId: "S1", doctor: "Himself", createdAt: "2026-10-01T10:00:00Z", collectedAt: "2026-10-01", notes: undefined, status: "draft",
  reviewedBy: undefined, approvedAt: undefined, version: 5,
  tests: [
    { name: "Hb", categoryId: "hem", categoryAr: "دم", categoryEn: "Hematology", value: "13", unit: "g/dL" },
    { name: "WBC", categoryId: "hem", categoryAr: "دم", categoryEn: "Hematology", value: "7", unit: "k/uL" },
  ],
});
const t = (name: string, value: string, extra: Record<string, unknown> = {}) => ({ name, categoryId: "hem", categoryAr: "دم", categoryEn: "Hematology", value, unit: "", ...extra });

test("reasons: known codes are in Arabic, unknown codes are shown not hidden, none has a default", () => {
  assert.match(describeReason("server_newer"), /عدّل/);
  assert.match(describeReason("report_locked"), /مسودة/);
  assert.match(describeReason("PERMISSION_DENIED"), /PERMISSION_DENIED/);
  assert.ok(describeReason(undefined).length > 0);
});

test("only a stale draft edit can be re-applied; locked / deleted / refused ones cannot", () => {
  assert.equal(canReapply({ status: "conflict", reason: "server_newer" }), true);
  assert.equal(canReapply({ status: "conflict", reason: "version_mismatch" }), true);
  assert.equal(canReapply({ status: "conflict", reason: "deleted_on_server" }), false);
  assert.equal(canReapply({ status: "rejected", reason: "report_locked" }), false);
  assert.equal(canReapply({ status: "pending" }), false);
});

test("re-applying rebases on the current version and puts the item back as pending, keeping its id", () => {
  const item: OutboxItem = {
    id: "i1", labId: "L", entity: "reports", entityId: "r1", op: "upsert", baseVersion: 3, payload: { a: 1 },
    createdAt: "x", status: "conflict", reason: "server_newer", attempts: 1,
  };
  const out = reapplyItem(item, 5);
  assert.deepEqual([out.id, out.baseVersion, out.status, out.reason, out.attempts], ["i1", 5, "pending", undefined, 1]);
  assert.deepEqual(out.payload, { a: 1 });
});

test("diff lists only what differs: changed value, added test, removed test", () => {
  const rows = diffReportEdit(server(), { age: 26, tests: [t("Hb", "11.5"), t("ESR", "20")] });
  const by = Object.fromEntries(rows.map((r) => [r.label, r]));
  assert.equal(by["السن"].mine, "26 سنة");
  assert.equal(by["السن"].server, "25 سنة");
  assert.equal(by["Hb"].mine, "11.5");
  assert.equal(by["Hb"].server, "13");
  assert.equal(by["ESR"].server, "غير موجود");
  assert.equal(by["WBC"].mine, "اتشال");
  assert.equal(by["اسم المريض"], undefined); // unchanged: not listed
});

test("an edit identical to the server's copy has an empty diff", () => {
  assert.deepEqual(diffReportEdit(server(), { tests: server().tests }), []);
  assert.deepEqual(diffReportEdit(server(), null), []);
});

test("diff: a changed custom range is reported on its own line", () => {
  const rows = diffReportEdit(server(), { tests: [t("Hb", "13", { unit: "g/dL", customRange: "12-16" }), t("WBC", "7", { unit: "k/uL" })] });
  assert.deepEqual(rows.map((r) => r.label), ["Hb (المدى)"]);
  assert.equal(rows[0].mine, "12-16");
  assert.equal(rows[0].server, "—");
});
