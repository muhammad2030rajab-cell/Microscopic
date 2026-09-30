import test from "node:test";
import assert from "node:assert/strict";
import { code128BValues, code128Layout, code128Runs } from "./code128.ts";

test("known symbol values (start B, data, checksum, stop)", () => {
  // Reference values produced independently by reportlab for B-only strings.
  assert.deepEqual(code128BValues("A"), [104, 33, 34, 106]);
  assert.deepEqual(code128BValues("DEMO-AHMED").slice(0, 6), [104, 36, 37, 45, 47, 13]);
});

test("every symbol is 11 modules wide, stop is 13", () => {
  for (const text of ["S-20260929-AB12CD", "DEMO-AHMED", "Hello, World! ~ {}"]) {
    const layout = code128Layout(text);
    const symbols = code128BValues(text).length;
    assert.equal(layout.width, (symbols - 1) * 11 + 13);
  }
});

test("runs start with a bar and alternate; widths are 1-4 modules", () => {
  const runs = code128Runs("S-20260929-AB12CD");
  assert.ok(runs.every((w) => w >= 1 && w <= 4));
  const { bars } = code128Layout("S-20260929-AB12CD");
  assert.equal(bars[0].x, 0);
  assert.equal(runs.length % 2, 1); // ends with a bar (stop pattern has 7 elements)
});

test("rejects empty and non-ASCII input instead of drawing a wrong barcode", () => {
  assert.throws(() => code128BValues(""));
  assert.throws(() => code128BValues("عينة"));
  assert.throws(() => code128BValues("tab\there"));
});
