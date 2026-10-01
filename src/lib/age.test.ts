import test from "node:test";
import assert from "node:assert/strict";
import { ageProblem, ageToYears, formatAge, isValidAge, parseAgeUnit } from "./age.ts";
import { parseAgeRanges, pickAgeRange } from "./age-ranges.ts";

test("limits per unit", () => {
  assert.equal(isValidAge(52, "years"), true);
  assert.equal(isValidAge(0, "years"), false);
  assert.equal(isValidAge(131, "years"), false);
  assert.equal(isValidAge(6, "months"), true);
  assert.equal(isValidAge(48, "months"), false); // use years from 4
  assert.equal(isValidAge(10, "days"), true);
  assert.equal(isValidAge(91, "days"), false);
  assert.equal(isValidAge(2.5, "years"), false);
  assert.equal(isValidAge(Number.NaN, "years"), false);
});

test("problem messages name the unit and limits", () => {
  assert.equal(ageProblem(40, "years"), null);
  assert.equal(ageProblem(0, "months"), "اكتب السن بالشهور (من 1 إلى 47)");
  assert.equal(ageProblem(0, "days"), "اكتب السن بالأيام (من 1 إلى 90)");
});

test("conversion to fractional years", () => {
  assert.equal(ageToYears(40, "years"), 40);
  assert.equal(ageToYears(6, "months"), 0.5);
  assert.equal(ageToYears(12, "months"), 1);
  assert.ok(Math.abs((ageToYears(10, "days") as number) - 10 / 365.25) < 1e-12);
  assert.equal(ageToYears(5), 5); // no unit = years (old data)
  assert.equal(ageToYears(undefined, "months"), undefined);
  assert.equal(ageToYears(-1, "years"), undefined);
});

test("unknown or missing units mean years (existing rows)", () => {
  assert.equal(parseAgeUnit(undefined), "years");
  assert.equal(parseAgeUnit(null), "years");
  assert.equal(parseAgeUnit("weeks"), "years");
  assert.equal(parseAgeUnit("months"), "months");
});

test("Arabic number agreement", () => {
  assert.equal(formatAge("ar", 1, "years"), "سنة");
  assert.equal(formatAge("ar", 2, "years"), "سنتان");
  assert.equal(formatAge("ar", 5, "years"), "5 سنوات");
  assert.equal(formatAge("ar", 52, "years"), "52 سنة");
  assert.equal(formatAge("ar", 1, "months"), "شهر");
  assert.equal(formatAge("ar", 6, "months"), "6 أشهر");
  assert.equal(formatAge("ar", 11, "months"), "11 شهرًا");
  assert.equal(formatAge("ar", 3, "days"), "3 أيام");
  assert.equal(formatAge("ar", 15, "days"), "15 يومًا");
  assert.equal(formatAge("ar", 40), "40 سنة"); // old rows
});

test("English is singular for 1", () => {
  assert.equal(formatAge("en", 1, "years"), "1 Year");
  assert.equal(formatAge("en", 52, "years"), "52 Years");
  assert.equal(formatAge("en", 6, "months"), "6 Months");
  assert.equal(formatAge("en", 1, "days"), "1 Day");
});

test("age-ranges.ts converts units exactly like ageToYears (boundaries must line up)", () => {
  for (const [text, n, unit] of [["0-28d: 1", 28, "days"], ["0-3mo: 1", 3, "months"], ["0-2y: 1", 2, "years"]] as const) {
    const r = parseAgeRanges(text);
    assert.ok(r.ok);
    if (r.ok) {
      // the exclusive upper bound equals the patient's age of the same size: excluded, with no off-by-epsilon
      assert.equal(r.bands[0].max, ageToYears(n, unit));
      assert.equal(pickAgeRange(r.bands, ageToYears(n, unit) as number, "ذكر"), null);
      assert.equal(pickAgeRange(r.bands, (ageToYears(n, unit) as number) - 1e-9, "ذكر"), "1");
    }
  }
});
