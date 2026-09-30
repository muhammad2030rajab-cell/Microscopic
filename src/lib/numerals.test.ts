import test from "node:test";
import assert from "node:assert/strict";
import { normalizeNumerals, toNumberText } from "./numerals.ts";

test("Arabic-Indic and Persian digits become Latin", () => {
  assert.equal(normalizeNumerals("٣٥"), "35");
  assert.equal(normalizeNumerals("٠١٠٢٠٣"), "010203");
  assert.equal(normalizeNumerals("۱۲۳"), "123");
  assert.equal(normalizeNumerals("Hb ١٢٫٥ g/dL"), "Hb 12.5 g/dL");
});

test("normalizing leaves Latin text and other characters alone", () => {
  assert.equal(normalizeNumerals("SGPT 45 U/L, ok"), "SGPT 45 U/L, ok");
  assert.equal(normalizeNumerals("سلبي"), "سلبي");
});

test("thousands comma is removed, decimal comma becomes a point", () => {
  assert.equal(toNumberText("1,200"), "1200");
  assert.equal(toNumberText("1,234,567"), "1234567");
  assert.equal(toNumberText("5,2"), "5.2");
  assert.equal(toNumberText("0,85"), "0.85");
  assert.equal(toNumberText("12,50"), "12.50");
  assert.equal(toNumberText("٥٫٢"), "5.2");
  assert.equal(toNumberText("٥,٢"), "5.2");
  assert.equal(toNumberText("١٬٢٠٠"), "1200");
});

test("plain numbers are untouched", () => {
  assert.equal(toNumberText("5.2"), "5.2");
  assert.equal(toNumberText("120"), "120");
  assert.equal(toNumberText("-3.5"), "-3.5");
});
