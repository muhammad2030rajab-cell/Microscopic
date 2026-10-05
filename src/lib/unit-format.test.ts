import assert from "node:assert/strict";
import test from "node:test";
import { formatUnit } from "./unit-format.ts";

test("exponents become superscripts", () => {
  assert.equal(formatUnit("10^3/µL"), "10³/µL");
  assert.equal(formatUnit("10^6/µL"), "10⁶/µL");
  assert.equal(formatUnit("10^12/L"), "10¹²/L");
  assert.equal(formatUnit("x10^-3/µL"), "x10⁻³/µL");
});

test("units without exponents are untouched", () => {
  for (const u of ["mg/dL", "g/dL", "%", "U/L", "µIU/mL", "mmol/L", "/HPF"]) assert.equal(formatUnit(u), u);
});

test("empty input is safe", () => {
  assert.equal(formatUnit(""), "");
  assert.equal(formatUnit(undefined), "");
  assert.equal(formatUnit(null), "");
});
