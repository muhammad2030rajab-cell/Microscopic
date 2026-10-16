import test from "node:test";
import assert from "node:assert/strict";
import { backupAlertText, unpaidAlertText } from "./lab-alerts.ts";

const DAY = 86_400_000;
const NOW = Date.parse("2026-10-16T12:00:00Z");

test("unpaid alert: nothing owed gives no alert", () => {
  assert.equal(unpaidAlertText(0, 0), null);
  assert.equal(unpaidAlertText(3, 0), null);
  assert.equal(unpaidAlertText(0, 5000), null);
  assert.equal(unpaidAlertText(Number.NaN, 5000), null);
});

test("unpaid alert: count and formatted total", () => {
  assert.equal(unpaidAlertText(3, 125000), "3 فاتورة عليها متبقي · 1,250 ج.م");
  assert.equal(unpaidAlertText(1, 5050), "1 فاتورة عليها متبقي · 50.50 ج.م");
});

test("backup alert: never shown where backup is not available", () => {
  assert.equal(backupAlertText(false, null, NOW), null);
  assert.equal(backupAlertText(false, new Date(NOW - 30 * DAY).toISOString(), NOW), null);
});

test("backup alert: never backed up, stale, and fresh", () => {
  assert.equal(backupAlertText(true, null, NOW), "لسه ماعملتش أي نسخة احتياطية");
  assert.equal(backupAlertText(true, new Date(NOW - 9 * DAY).toISOString(), NOW), "آخر نسخة احتياطية من 9 يوم");
  assert.equal(backupAlertText(true, new Date(NOW - 2 * DAY).toISOString(), NOW), null);
});
