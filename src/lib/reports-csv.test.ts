import test from "node:test";
import assert from "node:assert/strict";
import { csvCell, csvDate, reportsToCsv, type CsvReportRow } from "./reports-csv.ts";

const row: CsvReportRow = {
  patientCode: "P-0001", patientName: 'أحمد "الكبير", حسن', age: 45, gender: "ذكر", phone: "0100", sampleId: "S-1",
  doctor: "Himself", branchName: null, createdAt: "2026-10-05T09:30:00", status: "approved", testCount: 3, flaggedCount: 1, criticalCount: 0,
};

test("quotes commas and quotes, keeps plain text and numbers as they are", () => {
  assert.equal(csvCell('a,"b"'), '"a,""b"""');
  assert.equal(csvCell("plain"), "plain");
  assert.equal(csvCell(7), "7");
  assert.equal(csvCell(undefined), "");
});

test("text that would run as a spreadsheet formula is neutralised, numbers are not touched", () => {
  assert.equal(csvCell("=HYPERLINK(\"x\")"), "\"'=HYPERLINK(\"\"x\"\")\"");
  assert.equal(csvCell("+20 100"), "'+20 100");
  assert.equal(csvCell("@cmd"), "'@cmd");
  assert.equal(csvCell(-5), "-5");
});

test("starts with a BOM, uses CRLF, one line per report plus the header", () => {
  const csv = reportsToCsv([row, row], (s) => (s === "approved" ? "معتمد" : s));
  assert.ok(csv.startsWith("\uFEFF"));
  const lines = csv.trimEnd().split("\r\n");
  assert.equal(lines.length, 3);
  assert.ok(lines[1].includes("معتمد"));
  assert.ok(lines[1].includes('"أحمد ""الكبير"", حسن"'));
  assert.ok(!csv.includes("nationalId"));
});

test("dates are written as plain local dates; junk is kept as it came", () => {
  assert.equal(csvDate("2026-10-05T09:30:00"), "2026-10-05 09:30");
  assert.equal(csvDate("not a date"), "not a date");
});
