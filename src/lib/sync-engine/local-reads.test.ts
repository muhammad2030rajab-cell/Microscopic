import assert from "node:assert/strict";
import { test } from "node:test";
import { toReportDetail, toReportSummaries } from "./local-reads.ts";

const patient = { id: "p1", full_name: "منى أحمد", patient_code: "P-1", age: 25, age_unit: "years", gender: "أنثى", phone: "01012345678", national_id: null };
const report = (id: string, created: string, over: Record<string, unknown> = {}) => ({
  id, patient_id: "p1", sample_id: `S-${id}`, referring_doctor: null, created_at: created, collected_at: "2026-10-01T00:00:00Z",
  notes: null, status: "draft", reviewed_by: null, approved_at: null, ...over,
});

test("summaries: newest first, with flag counts from the stored flags", () => {
  const results = new Map([
    ["a", [{ flag: "normal" }, { flag: "high" }, { flag: "abnormal" }, { flag: "critical" }]],
    ["b", [{ flag: "low" }]],
  ]);
  const out = toReportSummaries([report("a", "2026-10-01T10:00:00Z"), report("b", "2026-10-02T10:00:00Z")], [patient], results);
  assert.deepEqual(out.map((r) => r.id), ["b", "a"]);
  const a = out[1];
  assert.deepEqual([a.testCount, a.flaggedCount, a.criticalCount], [4, 2, 1]);
  assert.equal(a.doctor, "Himself");
  assert.equal(a.collectedAt, "2026-10-01");
  assert.equal(a.patientName, "منى أحمد");
  assert.equal(a.nationalId, undefined);
  assert.equal(a.phone, "01012345678");
});

test("summaries: a report without its patient is skipped, a report without results shows zero", () => {
  const orphan = report("x", "2026-10-03T00:00:00Z", { patient_id: "gone" });
  const out = toReportSummaries([orphan, report("a", "2026-10-01T00:00:00Z")], [patient], new Map());
  assert.deepEqual(out.map((r) => [r.id, r.testCount]), [["a", 0]]);
});

test("summaries: odd values fall back safely (unknown status -> draft, unknown age unit -> years)", () => {
  const out = toReportSummaries(
    [report("a", "2026-10-01T00:00:00Z", { status: "weird" })],
    [{ ...patient, age_unit: "centuries", gender: "?" }],
    new Map(),
  );
  assert.equal(out[0].status, "draft");
  assert.equal(out[0].ageUnit, "years");
  assert.equal(out[0].gender, "ذكر");
});

test("detail: tests in sort order with the server's field names", () => {
  const out = toReportDetail(report("a", "2026-10-01T00:00:00Z", { status: "approved", approved_at: "2026-10-02T00:00:00Z" }), patient, [
    { test_name: "WBC", category_id: "hem", category_ar: "دم", category_en: "Hematology", result_value: "7", unit: "k/uL", reference_range: "4-11", sort_order: 1 },
    { test_name: "Hb", category_id: "hem", category_ar: "دم", category_en: "Hematology", result_value: "13", unit: null, reference_range: null, sort_order: 0 },
  ]);
  assert.ok(out);
  assert.deepEqual(out.tests.map((t) => t.name), ["Hb", "WBC"]);
  assert.equal(out.tests[0].unit, "");
  assert.equal(out.tests[0].customRange, undefined);
  assert.equal(out.tests[1].customRange, "4-11");
  assert.equal(out.status, "approved");
  assert.equal(out.approvedAt, "2026-10-02T00:00:00Z");
});

test("detail: missing report or patient = null, never a half-filled object", () => {
  assert.equal(toReportDetail(undefined, patient, []), null);
  assert.equal(toReportDetail(report("a", "2026-10-01T00:00:00Z"), undefined, []), null);
});
