import test from "node:test";
import assert from "node:assert/strict";
import { effectiveCatalogRange, parseAgeRanges, pickAgeRange } from "./age-ranges.ts";

const ok = (t: string) => {
  const r = parseAgeRanges(t);
  if (!r.ok) throw new Error(r.error);
  return r.bands;
};

test("empty / blank text is valid and has no bands", () => {
  assert.deepEqual(ok(""), []);
  assert.deepEqual(ok("  \n \n"), []);
  assert.deepEqual(ok(null as unknown as string), []);
});

test("bands: upper bound is exclusive and open-ended bands work", () => {
  const b = ok("1-12: 11.5-15.5\n12-18: 12-16\n65+: 12-16.5");
  assert.equal(pickAgeRange(b, 1, "ذكر"), "11.5-15.5");
  assert.equal(pickAgeRange(b, 11, "ذكر"), "11.5-15.5");
  assert.equal(pickAgeRange(b, 12, "ذكر"), "12-16"); // 12 belongs to the next band
  assert.equal(pickAgeRange(b, 30, "ذكر"), null); // gap: falls back to the sex range
  assert.equal(pickAgeRange(b, 65, "أنثى"), "12-16.5");
  assert.equal(pickAgeRange(b, 110, "أنثى"), "12-16.5");
});

test("sex-specific band beats a generic one; other sex falls back to generic", () => {
  const b = ok("12-18: 12-16\n12-18 ذكر: 13-16");
  assert.equal(pickAgeRange(b, 15, "ذكر"), "13-16");
  assert.equal(pickAgeRange(b, 15, "أنثى"), "12-16");
});

test("accepts M/F, Arabic digits, Arabic colon and en-dash", () => {
  const b = ok("١٢–١٨ F： 12-16");
  assert.equal(pickAgeRange(b, 13, "أنثى"), "12-16");
  assert.equal(pickAgeRange(b, 13, "ذكر"), null);
});

test("rejects malformed lines with the line number", () => {
  for (const [text, line] of [
    ["1-12 11.5-15.5", 1],
    ["1-12: 11-15\nabc: 5", 2],
    ["12-1: 5", 1],
    ["1-12:", 1],
    ["1-12 طفل: 5", 1],
    ["1-200: 5", 1],
  ] as const) {
    const r = parseAgeRanges(text);
    assert.equal(r.ok, false, text);
    if (!r.ok) assert.match(r.error, new RegExp(`سطر ${line}`), text);
  }
});

test("rejects overlapping bands (per sex group)", () => {
  assert.equal(parseAgeRanges("1-12: 5\n10-20: 6").ok, false);
  assert.equal(parseAgeRanges("65+: 5\n70-80: 6").ok, false);
  assert.equal(parseAgeRanges("1-12 ذكر: 5\n1-12 أنثى: 6").ok, true); // different sexes: fine
  assert.equal(parseAgeRanges("1-12: 5\n12-20: 6").ok, true); // touching: fine
});

test("effectiveCatalogRange: age band → lab sex range → undefined", () => {
  const row = { male_range: "13-17", female_range: "12-16", age_ranges: "1-12: 11.5-15.5" };
  assert.equal(effectiveCatalogRange(row, "ذكر", 8), "11.5-15.5");
  assert.equal(effectiveCatalogRange(row, "ذكر", 30), "13-17");
  assert.equal(effectiveCatalogRange(row, "أنثى", 30), "12-16");
  assert.equal(effectiveCatalogRange({ male_range: "", female_range: "" }, "ذكر", 30), undefined);
  assert.equal(effectiveCatalogRange(undefined, "ذكر", 30), undefined);
});

test("a malformed stored text never breaks a report", () => {
  const row = { male_range: "13-17", female_range: "12-16", age_ranges: "garbage" };
  assert.equal(effectiveCatalogRange(row, "ذكر", 8), "13-17");
});

test("built-in age band applies only while the lab range is still the built-in default", () => {
  const untouched = { male_range: "13-17", female_range: "12-16", age_ranges: null };
  const builtin = { sexDefault: "13-17", ageRange: "11-14.5" };
  assert.equal(effectiveCatalogRange(untouched, "ذكر", 8, builtin), "11-14.5");
  // the lab edited its range: its choice wins over the built-in band
  const customised = { male_range: "14-18", female_range: "12-16", age_ranges: null };
  assert.equal(effectiveCatalogRange(customised, "ذكر", 8, builtin), "14-18");
  // no built-in band for this age: plain sex range
  assert.equal(effectiveCatalogRange(untouched, "ذكر", 30, { sexDefault: "13-17" }), "13-17");
  // the lab's own age band beats everything
  const own = { male_range: "13-17", female_range: "12-16", age_ranges: "1-12: 10-13" };
  assert.equal(effectiveCatalogRange(own, "ذكر", 8, builtin), "10-13");
  // empty lab range + built-in band
  assert.equal(effectiveCatalogRange({ male_range: "", female_range: "" }, "ذكر", 8, builtin), "11-14.5");
});

test("months and days: units on bounds, inherited by the other bound", () => {
  const b = ok("0-28d: 14-24\n28d-1y: 10-18\n1-12: 11-15");
  assert.equal(pickAgeRange(b, 10 / 365.25, "ذكر"), "14-24"); // 10 days
  assert.equal(pickAgeRange(b, 28 / 365.25, "ذكر"), "10-18"); // exactly 28 days: lower bound inclusive
  assert.equal(pickAgeRange(b, 6 / 12, "ذكر"), "10-18"); // 6 months
  assert.equal(pickAgeRange(b, 1, "ذكر"), "11-15"); // 1 year
  const m = ok("1mo-12mo: 9.5-14");
  assert.equal(pickAgeRange(m, 1 / 12, "أنثى"), "9.5-14");
  assert.equal(pickAgeRange(m, 11 / 12, "أنثى"), "9.5-14");
  assert.equal(pickAgeRange(m, 1, "أنثى"), null); // 12 months is excluded (exclusive)
});

test("M/F sex tokens still work next to unit letters", () => {
  const b = ok("1-12 M: 5\n1-12 F: 6\n2mo-6mo ذكر: 7");
  assert.equal(pickAgeRange(b, 5, "ذكر"), "5");
  assert.equal(pickAgeRange(b, 5, "أنثى"), "6");
  assert.equal(pickAgeRange(b, 3 / 12, "ذكر"), "7");
});

test("overlap messages quote the bounds as written", () => {
  const r = parseAgeRanges("0-28d: 1\n10d-2mo: 2");
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.error, /0-28d/);
});

test("a day band inside a year band is NOT an overlap with a later year band", () => {
  assert.equal(parseAgeRanges("0-28d: 1\n28d-1y: 2\n1-12: 3").ok, true);
});
