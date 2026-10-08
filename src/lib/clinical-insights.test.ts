import test from "node:test";
import assert from "node:assert/strict";
import { analyzeInsights, type InsightItem } from "./clinical-insights.ts";

const it = (name: string, categoryId: string, value: number, flag: InsightItem["flag"] = "normal", unit?: string): InsightItem => ({ name, categoryId, value, flag, unit });
const run = (items: InsightItem[], gender: "ذكر" | "أنثى" = "ذكر", age = 30) => analyzeInsights({ gender, age, items });
const ids = (r: ReturnType<typeof run>) => r.map((x) => x.id);

test("a normal report produces no insights", () => {
  assert.deepEqual(run([it("Hemoglobin", "c3", 14), it("MCV", "c3", 88), it("Fasting Glucose", "c5", 85)]), []);
});

test("microcytic anemia with low Mentzer index favours thalassemia trait", () => {
  const r = run([it("Hemoglobin", "c3", 10.5, "low"), it("MCV", "c3", 62, "low"), it("RBCs", "c3", 5.8), it("Ferritin", "c8", 90)]);
  const a = r.find((x) => x.id === "anemia")!;
  assert.match(a.title, /صغيرة/);
  assert.match(a.detail, /الثلاسيميا/);
  assert.match(a.detail, /electrophoresis/);
});

test("microcytic anemia with high Mentzer index and low ferritin favours iron deficiency", () => {
  const r = run([it("Hemoglobin", "c3", 9, "low"), it("MCV", "c3", 70, "low"), it("RBCs", "c3", 4.0), it("Ferritin", "c8", 5, "low")]);
  const a = r.find((x) => x.id === "anemia")!;
  assert.match(a.detail, /نقص الحديد/);
  assert.equal(r.find((x) => x.id === "iron")!.level, "info"); // already covered by the anemia insight
});

test("low hemoglobin without MCV does not claim an anemia type yet", () => {
  const a = run([it("Hemoglobin", "c3", 9, "low")])[0];
  assert.equal(a.title, "الهيموجلوبين منخفض");
  assert.match(a.detail, /MCV/);
});

test("macrocytic and normocytic anemia get different advice", () => {
  assert.match(run([it("Hemoglobin", "c3", 9, "low"), it("MCV", "c3", 110, "high")])[0].detail, /B12/);
  assert.match(run([it("Hemoglobin", "c3", 9, "low"), it("MCV", "c3", 90)])[0].detail, /الشبكيات/);
});

test("pancytopenia and very low platelets are urgent and sort first", () => {
  const r = run([it("Hemoglobin", "c3", 8, "low"), it("WBCs", "c3", 2, "low"), it("Platelets", "c3", 15, "low"), it("TSH", "c7", 6, "high")]);
  assert.equal(r[0].level, "urgent");
  assert.ok(ids(r).includes("pancytopenia") && ids(r).includes("platelets"));
  assert.equal(r[r.length - 1].id, "thyroid");
});

test("platelets reported per µL are normalised", () => {
  assert.equal(run([it("Platelets", "c3", 15000, "low")])[0].level, "urgent");
  assert.deepEqual(run([it("Platelets", "c3", 250000)]), []);
});

test("glucose: diabetic range, HbA1c estimate, discordance and urgency", () => {
  const g = run([it("Fasting Glucose", "c5", 140, "high"), it("HbA1c", "c5", 6.0)]).find((x) => x.id === "glycemia")!;
  assert.equal(g.level, "attention");
  assert.match(g.detail, /عدم توافق/);
  assert.match(g.detail, /125 mg\/dL/); // eAG for HbA1c 6.0 = 28.7*6 - 46.7
  assert.equal(run([it("Random Glucose", "c5", 450, "high")])[0].level, "urgent");
});

test("glucose rules are skipped when the unit is mmol/L", () => {
  assert.deepEqual(run([it("Fasting Glucose", "c5", 7.5, "high", "mmol/L")]), []);
});

test("triglycerides >= 500 are urgent", () => {
  assert.equal(run([it("Triglycerides", "c4", 620, "high", "mg/dL")])[0].level, "urgent");
});

test("eGFR stages", () => {
  assert.match(run([it("eGFR", "c2", 52, "low")])[0].title, /G3a/);
  assert.match(run([it("eGFR", "c2", 38, "low")])[0].title, /G3b/);
  assert.equal(run([it("eGFR", "c2", 10, "low")])[0].level, "urgent");
  assert.deepEqual(run([it("eGFR", "c2", 95)]), []);
});

test("thyroid patterns follow the TSH / Free T4 combination", () => {
  assert.equal(run([it("TSH", "c7", 12, "high"), it("Free T4", "c7", 0.5, "low")])[0].level, "attention");
  assert.match(run([it("TSH", "c7", 6, "high"), it("Free T4", "c7", 1.2)])[0].title, /تحت سريري/);
  assert.match(run([it("TSH", "c7", 0.05, "low"), it("Free T4", "c7", 3, "high")])[0].title, /فرط/);
});

test("polycythemia only for adults and uses sex-specific cut-offs", () => {
  assert.equal(run([it("Hemoglobin", "c3", 17, "high")], "ذكر", 40)[0].id, "polycythemia");
  assert.deepEqual(run([it("Hemoglobin", "c3", 17, "high")], "ذكر", 5), []);
  assert.equal(run([it("Hemoglobin", "c3", 16.2, "high")], "أنثى", 40)[0].id, "polycythemia");
});

test("transferrin saturation below 16% flags iron deficiency even without anemia", () => {
  const r = run([it("Iron", "c8", 30), it("TIBC", "c8", 400)]);
  assert.equal(r[0].level, "attention");
  assert.match(r[0].detail, /8%/);
});
