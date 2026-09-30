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
