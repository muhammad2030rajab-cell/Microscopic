import test from "node:test";
import assert from "node:assert/strict";
import { rangeGeometry } from "./range-position.ts";

test("two-sided range: value inside sits inside the zone", () => {
  const g = rangeGeometry({ min: 70, max: 100 }, 85)!;
  assert.ok(g.marker > g.zoneStart && g.marker < g.zoneEnd);
  assert.equal(g.offScale, false);
});

test("two-sided range: low and high values land on opposite sides", () => {
  const low = rangeGeometry({ min: 70, max: 100 }, 60)!;
  const high = rangeGeometry({ min: 70, max: 100 }, 120)!;
  assert.ok(low.marker < low.zoneStart);
  assert.ok(high.marker > high.zoneEnd);
});

test("max-only range starts at zero", () => {
  const g = rangeGeometry({ max: 5 }, 2.5)!;
  assert.equal(g.zoneStart, 0);
  assert.ok(g.marker < g.zoneEnd);
});

test("min-only range: value below min is left of the zone", () => {
  const g = rangeGeometry({ min: 10 }, 4)!;
  assert.ok(g.marker < g.zoneStart);
});

test("far off-scale values are pinned inside the bar and flagged", () => {
  const g = rangeGeometry({ min: 70, max: 100 }, 900)!;
  assert.equal(g.offScale, true);
  assert.equal(g.marker, 98);
});

test("lower bound never goes below zero for non-negative ranges", () => {
  const g = rangeGeometry({ min: 1, max: 2 }, 1.5)!;
  assert.ok(g.zoneStart >= 0);
});

test("unusable input returns null", () => {
  assert.equal(rangeGeometry({}, 1), null);
  assert.equal(rangeGeometry({ min: 5, max: 5 }, 5), null);
  assert.equal(rangeGeometry({ max: 0 }, 1), null);
  assert.equal(rangeGeometry({ min: 1, max: 2 }, NaN), null);
});
