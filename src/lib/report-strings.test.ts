import test from "node:test";
import assert from "node:assert/strict";
import { S, ageSexValue, isReportLang, summaryLine, text } from "./report-strings.ts";

test("every string has both languages", () => {
  for (const [key, pair] of Object.entries(S)) {
    assert.ok(pair.en.trim(), `${key} en`);
    assert.ok(pair.ar.trim(), `${key} ar`);
    assert.match(pair.ar, /[\u0600-\u06FF]/, `${key} ar must be Arabic`);
    assert.doesNotMatch(pair.en, /[\u0600-\u06FF]/, `${key} en must not contain Arabic`);
  }
});

test("text() per language", () => {
  assert.equal(text("en", S.patientName), "Patient Name");
  assert.equal(text("ar", S.patientName), "اسم المريض");
  assert.equal(text("bi", S.patientName), "Patient Name / اسم المريض");
  // English-only in bi, exactly like the original report
  assert.equal(text("bi", S.labReport), "LABORATORY REPORT");
  assert.equal(text("bi", S.flag), "Flag");
});

test("age/sex value", () => {
  assert.equal(ageSexValue("bi", 52, "ذكر"), "52 Years / Male");
  assert.equal(ageSexValue("en", 30, "أنثى"), "30 Years / Female");
  assert.equal(ageSexValue("ar", 52, "ذكر"), "52 سنة / ذكر");
});

test("summary line", () => {
  assert.equal(summaryLine("en", { measured: 12, outside: 3, critical: 1 }), "3 of 12 results outside the reference range (1 critical)");
  assert.equal(summaryLine("ar", { measured: 12, outside: 3, critical: 0 }), "3 من 12 نتيجة خارج المدى المرجعي");
  assert.equal(summaryLine("ar", { measured: 5, outside: 0, critical: 0 }), "جميع النتائج ضمن المدى المرجعي");
});

test("isReportLang guards stored values", () => {
  assert.equal(isReportLang("ar"), true);
  assert.equal(isReportLang("fr"), false);
  assert.equal(isReportLang(null), false);
});
