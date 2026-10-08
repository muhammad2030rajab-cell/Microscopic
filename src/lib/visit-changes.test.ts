import test from "node:test";
import assert from "node:assert/strict";
import { summarizeVisitChanges, type VisitPair } from "./visit-changes.ts";

const pair = (name: string, previous: number | null, current: number | null, previousFlag: VisitPair["previousFlag"] = "normal", currentFlag: VisitPair["currentFlag"] = "normal"): VisitPair => ({ name, previous, current, previousFlag, currentFlag });

test("no change, no insights", () => {
  assert.deepEqual(summarizeVisitChanges([pair("Hemoglobin", 14, 14.2), pair("Platelets", 250, 260)], 30), []);
});

test("a sudden hemoglobin drop is reported with its percentage and values", () => {
  const [i] = summarizeVisitChanges([pair("Hemoglobin", 14, 9.8, "normal", "low")], 3);
  assert.equal(i.id, "visit-jumps");
  assert.match(i.detail, /-30%/);
  assert.deepEqual(i.basis, ["Hemoglobin 14 → 9.8"]);
});

test("the same relative move in a volatile test is not a jump", () => {
  assert.deepEqual(summarizeVisitChanges([pair("CRP", 10, 13)], 3), []);
});

test("results that left or returned to the normal range are listed separately", () => {
  const r = summarizeVisitChanges([pair("ALT", 30, 38, "normal", "high"), pair("Glucose", 150, 95, "high", "normal")], 60);
  assert.deepEqual(r.map((x) => x.id), ["visit-worsened", "visit-improved"]);
  assert.match(r[0].detail, /ALT/);
  assert.match(r[1].detail, /Glucose/);
});

test("non-numeric values are ignored and long lists are truncated", () => {
  assert.deepEqual(summarizeVisitChanges([pair("Color", null, null)], 10), []);
  const many = Array.from({ length: 8 }, (_, i) => pair(`T${i}`, 10, 12, "normal", "high"));
  assert.match(summarizeVisitChanges(many, 30)[0].detail, /و3 أخرى/);
});
