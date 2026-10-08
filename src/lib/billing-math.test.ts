import assert from "node:assert/strict";
import test from "node:test";
import { checkPayment, computeInvoice, formatMoney, parseMoney, toPiastres } from "./billing-math.ts";

test("parseMoney accepts plain, decimal and Arabic-digit amounts, rejects the rest", () => {
  assert.equal(parseMoney("120"), 12000);
  assert.equal(parseMoney("120.5"), 12050);
  assert.equal(parseMoney("١٢٠٫٥٠"), 12050);
  assert.equal(parseMoney(" 1 200,25 "), 120025);
  assert.equal(parseMoney(75), 7500);
  for (const bad of ["", "abc", "-5", "1.234", "1e3", "12..5", null, undefined, NaN, -1, 10_000_001, "10000001"]) assert.equal(parseMoney(bad), null, String(bad));
});

test("amounts never drift (0.1 + 0.2)", () => {
  const inv = computeInvoice(toPiastres(0.1) + toPiastres(0.2), 0, []);
  assert.equal(inv.subtotal, 30);
});

test("invoice: totals, discount clamp, status", () => {
  assert.deepEqual(computeInvoice(0, 0, []), { subtotal: 0, discount: 0, total: 0, paid: 0, remaining: 0, overpaid: 0, status: "unpriced" });
  assert.equal(computeInvoice(50000, 5000, []).status, "unpaid");
  assert.equal(computeInvoice(50000, 5000, []).total, 45000);
  const part = computeInvoice(50000, 5000, [10000]);
  assert.deepEqual([part.paid, part.remaining, part.status], [10000, 35000, "partial"]);
  assert.equal(computeInvoice(50000, 5000, [10000, 35000]).status, "paid");
  assert.equal(computeInvoice(50000, 99999, []).discount, 50000, "discount cannot exceed the subtotal");
  assert.equal(computeInvoice(50000, 99999, []).total, 0);
  const over = computeInvoice(10000, 0, [12000]);
  assert.deepEqual([over.remaining, over.overpaid, over.status], [0, 2000, "paid"]);
});

test("a payment must be positive and within what is owed", () => {
  assert.deepEqual(checkPayment("100", 35000), { ok: true, amount: 10000 });
  assert.deepEqual(checkPayment("350", 35000), { ok: true, amount: 35000 });
  assert.equal(checkPayment("350.01", 35000).ok, false);
  assert.equal(checkPayment("0", 35000).ok, false);
  assert.equal(checkPayment("x", 35000).ok, false);
  assert.equal(checkPayment("10", 0).ok, false);
});

test("formatMoney", () => {
  assert.equal(formatMoney(12000), "120 ج.م");
  assert.equal(formatMoney(12050), "120.50 ج.م");
  assert.equal(formatMoney(125000000), "1,250,000 ج.م");
});
