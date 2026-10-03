import test from "node:test";
import assert from "node:assert/strict";
import { isValidPhone, phoneDigits, toWhatsAppNumber } from "./phone.ts";

test("digits only, Arabic-Indic digits converted, symbols removed", () => {
  assert.equal(phoneDigits("٠١٠ ١٢٣-٤٥٦٧٨"), "01012345678");
  assert.equal(phoneDigits("+20 101 234 5678"), "201012345678");
  assert.equal(phoneDigits(null), "");
  assert.equal(phoneDigits(undefined), "");
});

test("valid = 10 to 15 digits", () => {
  assert.equal(isValidPhone("01012345678"), true);
  assert.equal(isValidPhone("٠١٠١٢٣٤٥٦٧٨"), true);
  assert.equal(isValidPhone("0101234"), false);
  assert.equal(isValidPhone(""), false);
  assert.equal(isValidPhone("1234567890123456"), false);
});

test("WhatsApp number: Egyptian local numbers get +20", () => {
  assert.equal(toWhatsAppNumber("01012345678"), "201012345678");
  assert.equal(toWhatsAppNumber("٠١٠١٢٣٤٥٦٧٨"), "201012345678");
  assert.equal(toWhatsAppNumber("1012345678"), "201012345678");
  assert.equal(toWhatsAppNumber("+20 101 234 5678"), "201012345678");
  assert.equal(toWhatsAppNumber("00201012345678"), "201012345678");
});

test("WhatsApp number: no number or an unusable one gives null", () => {
  assert.equal(toWhatsAppNumber(""), null);
  assert.equal(toWhatsAppNumber(null), null);
  assert.equal(toWhatsAppNumber("12345"), null);
});
