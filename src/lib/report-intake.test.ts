import assert from "node:assert/strict";
import test from "node:test";
import { EMPTY_INTAKE, isEmptyIntake, normalizeIntake, sampleLine } from "./report-intake.ts";

test("anything becomes a complete intake", () => {
  assert.deepEqual(normalizeIntake(undefined), EMPTY_INTAKE);
  assert.deepEqual(normalizeIntake(null), EMPTY_INTAKE);
  assert.deepEqual(normalizeIntake("x"), EMPTY_INTAKE);
  assert.deepEqual(normalizeIntake({}), EMPTY_INTAKE);
});

test("keeps known keys only, no duplicates", () => {
  const i = normalizeIntake({ sampleTypes: ["blood", "blood", "urine", "hack"], flags: ["pregnant", "x", "pregnant"] });
  assert.deepEqual(i.sampleTypes, ["blood", "urine"]);
  assert.deepEqual(i.flags, ["pregnant"]);
});

test("fasting hours only count when fasting and are sane", () => {
  assert.equal(normalizeIntake({ fasting: false, fastingHours: 12 }).fastingHours, null);
  assert.equal(normalizeIntake({ fasting: true, fastingHours: 12 }).fastingHours, 12);
  assert.equal(normalizeIntake({ fasting: true, fastingHours: 11.6 }).fastingHours, 12);
  assert.equal(normalizeIntake({ fasting: true, fastingHours: 500 }).fastingHours, null);
  assert.equal(normalizeIntake({ fasting: true, fastingHours: -3 }).fastingHours, null);
  assert.equal(normalizeIntake({ fasting: true, fastingHours: "abc" }).fastingHours, null);
});

test("referral is trimmed and capped; booleans must be real booleans", () => {
  assert.equal(normalizeIntake({ referral: "  مستشفى   النور  " }).referral, "مستشفى النور");
  assert.equal(normalizeIntake({ referral: "x".repeat(200) }).referral.length, 80);
  assert.equal(normalizeIntake({ vip: "true", takenOutside: 1 }).vip, false);
  assert.equal(normalizeIntake({ vip: true }).vip, true);
});

test("isEmptyIntake / sampleLine", () => {
  assert.equal(isEmptyIntake(EMPTY_INTAKE), true);
  assert.equal(isEmptyIntake(normalizeIntake({ vip: true })), false);
  const i = normalizeIntake({ sampleTypes: ["blood", "urine"], fasting: true, fastingHours: 12 });
  assert.equal(sampleLine(i, "en"), "Blood, Urine · Fasting 12 h");
  assert.equal(sampleLine(i, "ar"), "دم، بول · صائم 12 ساعة");
  assert.equal(sampleLine(EMPTY_INTAKE, "en"), "");
  assert.equal(sampleLine(normalizeIntake({ fasting: true }), "en"), "Fasting");
});
