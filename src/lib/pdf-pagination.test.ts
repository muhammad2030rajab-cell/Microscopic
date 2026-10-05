import assert from "node:assert/strict";
import test from "node:test";
import { paginate } from "./pdf-pagination.ts";

const base = { pageHeight: 1000, headerHeight: 100, footerHeight: 60, bottomReserve: 40 };
// body capacity per page = 1000 - 100 - 60 - 40 = 800

test("a sheet that fits one page is left as it is", () => {
  assert.deepEqual(paginate({ ...base, totalHeight: 900, breakpoints: [300, 600] }), [{ from: 0, to: 900 }]);
});

test("cuts at the last allowed break that fits, never through a row", () => {
  const slices = paginate({ ...base, totalHeight: 2000, breakpoints: [200, 500, 850, 900, 1300, 1650, 1800] });
  // page 1 body: 100..900 (900 is the largest break <= 100+800)
  assert.deepEqual(slices[0], { from: 100, to: 900 });
  for (const s of slices) assert.ok(s.to - s.from <= 800 + 0.5, "slice must fit the page");
  // contiguous and covers the whole body (100 .. 2000-60)
  for (let i = 1; i < slices.length; i++) assert.equal(slices[i].from, slices[i - 1].to);
  assert.equal(slices.at(-1)?.to, 1940);
});

test("falls back to a hard cut only when no break point fits", () => {
  const slices = paginate({ ...base, totalHeight: 2000, breakpoints: [] });
  assert.deepEqual(slices[0], { from: 100, to: 900 });
  assert.equal(slices.at(-1)?.to, 1940);
});

test("ignores breakpoints inside the header or footer", () => {
  const slices = paginate({ ...base, totalHeight: 2000, breakpoints: [50, 1990, 880] });
  assert.deepEqual(slices[0], { from: 100, to: 880 });
});

test("a block taller than a page does not loop forever", () => {
  const slices = paginate({ ...base, totalHeight: 3000, breakpoints: [150, 2900] });
  assert.ok(slices.length >= 3 && slices.length < 10);
  assert.equal(slices.at(-1)?.to, 2940);
});

test("rejects a page too small to hold header and footer", () => {
  assert.throws(() => paginate({ pageHeight: 150, headerHeight: 100, footerHeight: 60, bottomReserve: 10, totalHeight: 900, breakpoints: [] }));
});
