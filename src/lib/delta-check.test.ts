import test from "node:test";
import assert from "node:assert/strict";
import { analyzeDelta, classifyVolatility, daysBetween, timeFactor } from "./delta-check.ts";

test("classifies stable, volatile and ordinary analytes (English + Arabic)", () => {
  assert.equal(classifyVolatility("Hemoglobin (Hb)"), "stable");
  assert.equal(classifyVolatility("كرياتينين"), "stable");
  assert.equal(classifyVolatility("CRP"), "volatile");
  assert.equal(classifyVolatility("Random Blood Glucose"), "volatile");
  assert.equal(classifyVolatility("Platelets"), "normal");
});

test("a 30% hemoglobin drop within days is flagged for review", () => {
  const r = analyzeDelta({ testName: "Hemoglobin", previous: 14, current: 9.8, daysBetween: 3 })!;
  assert.equal(r.direction, "down");
  assert.equal(r.pct, -30);
  assert.equal(r.severity, "review");
});

test("the same 30% move in CRP is not suspicious", () => {
  const r = analyzeDelta({ testName: "CRP", previous: 10, current: 13, daysBetween: 3 })!;
  assert.equal(r.severity, "none");
});

test("longer gaps relax the thresholds, short gaps tighten them", () => {
  const month = analyzeDelta({ testName: "Hemoglobin", previous: 14, current: 11, daysBetween: 30 })!; // -21.4%
  const week = analyzeDelta({ testName: "Hemoglobin", previous: 14, current: 11, daysBetween: 5 })!;
  const year = analyzeDelta({ testName: "Hemoglobin", previous: 14, current: 11, daysBetween: 400 })!;
  assert.equal(month.severity, "notable");
  assert.equal(week.severity, "review");
  assert.equal(year.severity, "notable"); // notable threshold is 15% at the 1.5x factor
  assert.equal(timeFactor(null), 1);
});

test("equal values and a zero baseline never raise a flag", () => {
  assert.equal(analyzeDelta({ testName: "Hemoglobin", previous: 12, current: 12 })!.severity, "none");
  const z = analyzeDelta({ testName: "Platelets", previous: 0, current: 5 })!;
  assert.equal(z.pct, null);
  assert.equal(z.severity, "none");
});

test("non-finite input returns null", () => {
  assert.equal(analyzeDelta({ testName: "x", previous: NaN, current: 1 }), null);
});

test("daysBetween handles ISO dates and garbage", () => {
  assert.equal(daysBetween("2026-09-01T00:00:00Z", "2026-09-11T12:00:00Z"), 10);
  assert.equal(daysBetween("nope", "2026-09-11"), null);
});
