import assert from "node:assert/strict";
import test from "node:test";
import {
  applyMove,
  daysBetween,
  expiryState,
  formatQuantity,
  parseDateOnly,
  parseQuantity,
  serviceState,
  stockState,
  summarizeInventory,
  todayInCairo,
  warrantyState,
} from "./inventory-math.ts";
import { cleanDeviceInput, cleanMoveInput, cleanSupplyInput } from "./inventory-input.ts";

test("dates: strict calendar dates only, Arabic digits accepted", () => {
  assert.equal(parseDateOnly("2026-10-08"), "2026-10-08");
  assert.equal(parseDateOnly("٢٠٢٦-١٠-٠٨"), "2026-10-08");
  assert.equal(parseDateOnly("2026-02-30"), null);
  assert.equal(parseDateOnly("2026-13-01"), null);
  assert.equal(parseDateOnly("08/10/2026"), null);
  assert.equal(parseDateOnly("1800-01-01"), null);
  assert.equal(parseDateOnly(undefined), null);
  assert.equal(daysBetween("2026-10-08", "2026-10-09"), 1);
  assert.equal(daysBetween("2026-10-08", "2026-10-01"), -7);
  assert.equal(daysBetween("2026-02-27", "2026-03-01"), 2);
});

test("today rolls over at Cairo midnight, not UTC midnight", () => {
  // Summer (UTC+3): 22:30 UTC is already 01:30 of the next day in Cairo.
  assert.equal(todayInCairo(new Date("2026-07-08T22:30:00Z")), "2026-07-09");
  assert.equal(todayInCairo(new Date("2026-07-08T20:30:00Z")), "2026-07-08");
  // Winter (UTC+2): 21:30 UTC is 23:30 the same day, 22:30 UTC is 00:30 the next day.
  assert.equal(todayInCairo(new Date("2026-01-08T21:30:00Z")), "2026-01-08");
  assert.equal(todayInCairo(new Date("2026-01-08T22:30:00Z")), "2026-01-09");
  assert.match(todayInCairo(), /^\d{4}-\d{2}-\d{2}$/);
});

test("quantities: Arabic digits and decimal separators, no negatives, 2 decimals max", () => {
  assert.equal(parseQuantity("12"), 12);
  assert.equal(parseQuantity("١٢٫٥"), 12.5);
  assert.equal(parseQuantity("0,25"), 0.25);
  assert.equal(parseQuantity(7), 7);
  assert.equal(parseQuantity("-1"), null);
  assert.equal(parseQuantity("1.234"), null);
  assert.equal(parseQuantity("abc"), null);
  assert.equal(parseQuantity(""), null);
  assert.equal(parseQuantity("1000000001"), null);
  assert.equal(formatQuantity(12), "12");
  assert.equal(formatQuantity(12.5), "12.5");
});

test("stock: out, low (only when a minimum is set), ok", () => {
  assert.equal(stockState(0, 5), "out");
  assert.equal(stockState(5, 5), "low");
  assert.equal(stockState(6, 5), "ok");
  assert.equal(stockState(1, 0), "ok");
});

test("expiry and service alerts", () => {
  const today = "2026-10-08";
  assert.equal(expiryState(null, today), "none");
  assert.equal(expiryState("2026-10-07", today), "expired");
  assert.equal(expiryState("2026-10-08", today), "soon");
  assert.equal(expiryState("2026-11-07", today), "soon");
  assert.equal(expiryState("2026-11-08", today), "ok");
  assert.equal(serviceState(null, today), "none");
  assert.equal(serviceState("2026-10-07", today), "overdue");
  assert.equal(serviceState("2026-10-22", today), "soon");
  assert.equal(serviceState("2026-10-23", today), "ok");
  assert.equal(warrantyState("2026-10-07", today), "expired");
  assert.equal(warrantyState("2026-10-08", today), "active");
  assert.equal(warrantyState(null, today), "none");
});

test("summary counts what needs attention", () => {
  const today = "2026-10-08";
  const s = summarizeInventory(
    [
      { quantity: 0, minQuantity: 2, expiryDate: null },
      { quantity: 10, minQuantity: 2, expiryDate: "2026-10-20" },
      { quantity: 10, minQuantity: 2, expiryDate: "2027-10-20" },
    ],
    [
      { status: "working", nextServiceDate: "2027-01-01" },
      { status: "maintenance", nextServiceDate: null },
      { status: "working", nextServiceDate: "2026-09-01" },
    ],
    today,
  );
  assert.deepEqual(s, { lowOrOut: 1, expiringOrExpired: 1, devicesNeedingAttention: 2 });
});

test("stock never goes below zero", () => {
  assert.equal(applyMove(5, "out", 5), 0);
  assert.equal(applyMove(5, "out", 5.01), null);
  assert.equal(applyMove(5, "in", 2.5), 7.5);
  assert.equal(applyMove(0.1, "in", 0.2), 0.3);
});

test("device input: trims, validates dates and order, rejects bad status", () => {
  const d = cleanDeviceInput({ name: "  جهاز   كيمياء ", status: "working", lastServiceDate: "2026-01-01", nextServiceDate: "2026-07-01", notes: "" });
  assert.equal(d.name, "جهاز كيمياء");
  assert.equal(d.notes, null);
  assert.equal(d.nextServiceDate, "2026-07-01");
  assert.throws(() => cleanDeviceInput({ name: "a" }), /قصير/);
  assert.throws(() => cleanDeviceInput({ name: "جهاز", status: "broken" }), /حالة/);
  assert.throws(() => cleanDeviceInput({ name: "جهاز", purchaseDate: "2026-02-31" }), /تاريخ/);
  assert.throws(() => cleanDeviceInput({ name: "جهاز", lastServiceDate: "2026-05-01", nextServiceDate: "2026-04-01" }), /قبل/);
  assert.equal(cleanDeviceInput({ name: "جهاز" }).status, "working");
});

test("supply input: quantities default to zero, bad numbers are rejected", () => {
  const s = cleanSupplyInput({ name: "أنابيب EDTA", unit: "علبة", quantity: "١٠", minQuantity: "", expiryDate: "2027-01-01" });
  assert.equal(s.quantity, 10);
  assert.equal(s.minQuantity, 0);
  assert.equal(s.expiryDate, "2027-01-01");
  assert.throws(() => cleanSupplyInput({ name: "كاشف", quantity: "-3" }), /الكمية/);
  assert.throws(() => cleanSupplyInput({ name: "كاشف", minQuantity: "x" }), /الحد الأدنى/);
  assert.throws(() => cleanSupplyInput({ name: "كاشف", expiryDate: "غدا" }), /تاريخ/);
  assert.throws(() => cleanSupplyInput({ name: "x".repeat(121) }), /أطول/);
});

test("move input: only received or used, amount above zero", () => {
  assert.deepEqual(cleanMoveInput({ kind: "in", amount: "5", note: " توريد " }), { kind: "in", amount: 5, note: "توريد" });
  assert.throws(() => cleanMoveInput({ kind: "adjust", amount: 1 }), /نوع/);
  assert.throws(() => cleanMoveInput({ kind: "out", amount: 0 }), /أكبر/);
  assert.throws(() => cleanMoveInput({ kind: "out", amount: "abc" }), /أكبر/);
});
