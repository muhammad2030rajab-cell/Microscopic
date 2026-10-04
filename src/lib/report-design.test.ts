import assert from "node:assert/strict";
import test from "node:test";
import { ASSET_MAX_CHARS, DEFAULT_REPORT_DESIGN, normalizeAsset, normalizeDesign, normalizeHex, readableOn } from "./report-design.ts";

test("normalizeDesign: empty / garbage input gives the defaults", () => {
  assert.deepEqual(normalizeDesign(null), DEFAULT_REPORT_DESIGN);
  assert.deepEqual(normalizeDesign("x"), DEFAULT_REPORT_DESIGN);
  assert.deepEqual(normalizeDesign({}), DEFAULT_REPORT_DESIGN);
});

test("normalizeDesign: keeps valid values and fixes invalid ones", () => {
  const d = normalizeDesign({ template: "pro", accent: "#1D4ED8", tableStyle: "modern", paper: "letterhead", letterheadTopMm: 500, letterheadBottomMm: -4, footerNote: "  9ص  -  9م  ", showQr: false, showCorner: false });
  assert.equal(d.template, "pro");
  assert.equal(d.accent, "#1d4ed8");
  assert.equal(d.tableStyle, "modern");
  assert.equal(d.paper, "letterhead");
  assert.equal(d.letterheadTopMm, 100);
  assert.equal(d.letterheadBottomMm, 0);
  assert.equal(d.footerNote, "9ص - 9م");
  assert.equal(d.showQr, false);
  assert.equal(d.showCorner, false);
  const bad = normalizeDesign({ accent: "red", tableStyle: "weird", paper: "x", letterheadTopMm: "abc" });
  assert.equal(bad.accent, null);
  assert.equal(normalizeDesign({ template: "fancy" }).template, "standard");
  assert.equal(bad.tableStyle, "classic");
  assert.equal(bad.paper, "a4");
  assert.equal(bad.letterheadTopMm, DEFAULT_REPORT_DESIGN.letterheadTopMm);
});

test("normalizeHex rejects anything that is not #RRGGBB (no CSS injection)", () => {
  assert.equal(normalizeHex("#abc"), null);
  assert.equal(normalizeHex("#12345g"), null);
  assert.equal(normalizeHex("#123456; background:url(x)"), null);
  assert.equal(normalizeHex("#ABCDEF"), "#abcdef");
});

test("normalizeAsset only accepts small png/jpeg/webp data URIs", () => {
  assert.equal(normalizeAsset("data:image/png;base64,iVBORw0KGgo="), "data:image/png;base64,iVBORw0KGgo=");
  assert.equal(normalizeAsset("data:image/svg+xml;base64,PHN2Zz4="), null);
  assert.equal(normalizeAsset("https://example.com/x.png"), null);
  assert.equal(normalizeAsset("data:image/png;base64," + "A".repeat(ASSET_MAX_CHARS)), null);
  assert.equal(normalizeAsset(""), null);
});

test("readableOn picks white on dark accents and dark on light ones", () => {
  assert.equal(readableOn("#0f172a"), "#ffffff");
  assert.equal(readableOn("#1d4ed8"), "#ffffff");
  assert.equal(readableOn("#fde68a"), "#0f172a");
  assert.equal(readableOn("#ffffff"), "#0f172a");
});
