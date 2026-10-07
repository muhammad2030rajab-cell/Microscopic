import assert from "node:assert/strict";
import { test } from "node:test";
import { labDayKey, toCatalogRows, toLabAnalytics, toDashboardStats, toPatientReports, toPatientSummaries, toRecentReports } from "./local-screens.ts";

const patients = [
  { id: "p1", full_name: "منى أحمد", patient_code: "P-1", age: 25, age_unit: "years", gender: "أنثى", phone: "01012345678", national_id: "29001010101010" },
  { id: "p2", full_name: "محمد علي", patient_code: "P-2", age: 6, age_unit: "months", gender: "ذكر", phone: null, national_id: null },
  { id: "p3", full_name: "أحمد حسن", patient_code: null, age: 40, age_unit: null, gender: "ذكر", phone: "01199999999", national_id: null },
];
const report = (id: string, patient: string, created: string, over: Record<string, unknown> = {}) => ({
  id, patient_id: patient, sample_id: `S-${id}`, status: "draft", created_at: created, ...over,
});

test("patient search: Arabic folding on the name, plain text on code / phone / national id", () => {
  assert.deepEqual(toPatientSummaries(patients, [], "احمد").map((p) => p.id).sort(), ["p1", "p3"]); // أ and ا match
  assert.deepEqual(toPatientSummaries(patients, [], "P-2").map((p) => p.id), ["p2"]);
  assert.deepEqual(toPatientSummaries(patients, [], "0101234").map((p) => p.id), ["p1"]);
  assert.deepEqual(toPatientSummaries(patients, [], "2900101").map((p) => p.id), ["p1"]);
  assert.deepEqual(toPatientSummaries(patients, [], "   "), []);
});

test("patient search: report count and last report, most recently seen patient first, none last", () => {
  const reports = [report("a", "p1", "2026-10-01T10:00:00Z"), report("b", "p3", "2026-10-03T10:00:00Z"), report("c", "p3", "2026-10-02T10:00:00Z")];
  const out = toPatientSummaries(patients, reports, "م");
  assert.deepEqual(out.map((p) => p.id), ["p3", "p1", "p2"]);
  assert.deepEqual([out[0].reportCount, out[0].lastReportAt], [2, "2026-10-03T10:00:00Z"]);
  assert.equal(out[2].reportCount, 0);
  assert.equal(out[2].lastReportAt, undefined);
});

test("patient search: shape matches the server (units, missing fields, 12 result cap)", () => {
  const p = toPatientSummaries(patients, [], "محمد")[0];
  assert.deepEqual([p.ageUnit, p.age, p.phone, p.nationalId, p.patientCode], ["months", 6, undefined, undefined, "P-2"]);
  assert.equal(toPatientSummaries(patients, [], "منى")[0].ageUnit, "years");
  const many = Array.from({ length: 30 }, (_, i) => ({ ...patients[0], id: `x${i}`, full_name: `مريض ${i}` }));
  assert.equal(toPatientSummaries(many, [], "مريض").length, 12);
});

test("patient history: only that patient, newest first, capped at 30", () => {
  const reports = [report("a", "p1", "2026-10-01T10:00:00Z"), report("b", "p2", "2026-10-05T10:00:00Z"), report("c", "p1", "2026-10-04T10:00:00Z", { sample_id: null })];
  const out = toPatientReports(reports, "p1");
  assert.deepEqual(out.map((r) => r.id), ["c", "a"]);
  assert.equal(out[0].sample_id, null);
  const lots = Array.from({ length: 40 }, (_, i) => report(`r${i}`, "p1", `2026-09-${String((i % 28) + 1).padStart(2, "0")}T00:00:00Z`));
  assert.equal(toPatientReports(lots, "p1").length, 30);
});

test("labDayKey: the lab's calendar day, not UTC's", () => {
  // 22:30 UTC on Oct 5 is already Oct 6 in Cairo (UTC+3 in summer time... and UTC+2 in winter: either way after midnight).
  assert.equal(labDayKey("2026-10-05T22:30:00Z"), "2026-10-06");
  assert.equal(labDayKey("2026-10-05T10:00:00Z"), "2026-10-05");
  assert.equal(labDayKey("not a date"), "");
});

test("dashboard stats: today's non-cancelled reports, pending, approved, distinct critical today", () => {
  const now = Date.parse("2026-10-05T12:00:00Z");
  const reports = [
    report("t1", "p1", "2026-10-05T08:00:00Z", { status: "pending_review" }),
    report("t2", "p2", "2026-10-05T09:00:00Z", { status: "approved" }),
    report("t3", "p2", "2026-10-05T09:30:00Z", { status: "cancelled" }),
    report("old", "p1", "2026-10-01T09:00:00Z", { status: "pending_review" }),
  ];
  const results = [
    { report_id: "t1", flag: "critical" }, { report_id: "t1", flag: "critical" }, // one report counts once
    { report_id: "t3", flag: "critical" }, // cancelled
    { report_id: "old", flag: "critical" }, // not today
    { report_id: "t2", flag: "high" },
  ];
  assert.deepEqual(toDashboardStats(patients, reports, results, now), { patients: 3, reportsToday: 2, pendingReview: 2, approved: 1, critical: 1 });
});

test("recent reports: skips cancelled, keeps order, five at most", () => {
  const mk = (id: string, status: string) => ({ id, patientName: id, patientCode: "", age: 1, ageUnit: "years", gender: "ذكر", sampleId: "", doctor: "", createdAt: id, status, testCount: 3, flaggedCount: 1, criticalCount: 0, tests: [] });
  const list = [mk("a", "approved"), mk("b", "cancelled"), ...["c", "d", "e", "f", "g"].map((i) => mk(i, "draft"))];
  const out = toRecentReports(list as never);
  assert.deepEqual(out.map((r) => r.id), ["a", "c", "d", "e", "f"]);
  assert.deepEqual(Object.keys(out[0]).sort(), ["age", "ageUnit", "createdAt", "criticalCount", "flaggedCount", "gender", "id", "patientName", "status"]);
});

test("catalog rows: ordered by category then name, nulls kept, inactive kept inactive", () => {
  const row = (id: string, cat: string, name: string, over: Record<string, unknown> = {}) => ({
    id, category_id: cat, test_name: name, category_name_ar: "ك", category_name_en: "C", unit: "u", male_range: "1-2", female_range: "1-2", age_ranges: "", method_info: null, is_active: true, lab_id: "L", version: 3, ...over,
  });
  const out = toCatalogRows([row("3", "liver", "ALT"), row("1", "cbc", "WBC"), row("2", "cbc", "HB", { is_active: false, method_info: "طريقة" }), row("4", "cbc", "RBC", { is_active: undefined })]);
  assert.deepEqual(out.map((r) => r.test_name), ["HB", "RBC", "WBC", "ALT"]);
  assert.deepEqual([out[0].is_active, out[0].method_info, out[1].is_active, out[0].age_ranges], [false, "طريقة", true, null]);
  assert.equal("lab_id" in out[0], false);
});

test("analytics: 14 days ending today, counts per day, status and totals", () => {
  const now = Date.parse("2026-10-07T10:00:00Z");
  const reports = [
    report("a", "p1", "2026-10-07T08:00:00Z", { status: "approved" }),
    report("b", "p1", "2026-10-07T09:00:00Z", { status: "cancelled" }),
    report("c", "p2", "2026-10-01T09:00:00Z", { status: "approved" }),
    report("old", "p2", "2026-09-01T09:00:00Z", { status: "draft" }),
  ];
  const out = toLabAnalytics(patients, reports, [], now);
  assert.equal(out.daily.length, 14);
  assert.equal(out.daily[13].day, "2026-10-07");
  assert.equal(out.daily[0].day, "2026-09-24");
  assert.equal(out.daily[13].count, 2); // cancelled counts too, as on the server
  assert.equal(out.daily.find((d) => d.day === "2026-10-01")?.count, 1);
  assert.equal(out.daily.reduce((n, d) => n + d.count, 0), 3); // the September report is outside the window
  assert.equal(out.totalReports, 4);
  assert.equal(out.totalPatients, 3);
  assert.deepEqual(out.statusBreakdown.find((s) => s.status === "approved"), { status: "approved", count: 2 });
});

test("analytics: top tests ranked, critical counted, results of unknown reports ignored", () => {
  const now = Date.parse("2026-10-07T10:00:00Z");
  const reports = [report("a", "p1", "2026-10-07T08:00:00Z")];
  const results = [
    { report_id: "a", test_name: "Hb", flag: "normal" },
    { report_id: "a", test_name: "WBC", flag: "critical" },
    { report_id: "a", test_name: "Hb", flag: "high" },
    { report_id: "gone", test_name: "Hb", flag: "critical" },
  ];
  const out = toLabAnalytics(patients, reports, results, now);
  assert.deepEqual(out.topTests, [{ name: "Hb", count: 2 }, { name: "WBC", count: 1 }]);
  assert.equal(out.criticalCount, 1);
});

test("analytics: a month change in the 14-day window does not skip or repeat a day", () => {
  const out = toLabAnalytics([], [], [], Date.parse("2026-03-05T10:00:00Z"));
  const days = out.daily.map((d) => d.day);
  assert.equal(new Set(days).size, 14);
  assert.deepEqual([days[0], days[13]], ["2026-02-20", "2026-03-05"]);
});
