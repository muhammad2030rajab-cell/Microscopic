import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_REPORT_FILTERS, parseReportFilters } from "./reports-filters.ts";

test("valid fields pass through", () => {
  assert.deepEqual(parseReportFilters({ q: "احمد", status: "pending_review", period: "today", onlyCritical: true }), {
    q: "احمد",
    status: "pending_review",
    period: "today",
    onlyCritical: true,
  });
});

test("unknown values and wrong types are dropped, not trusted", () => {
  assert.deepEqual(parseReportFilters({ status: "hacked", period: 5, onlyCritical: "yes", q: 7 }), {});
  assert.deepEqual(parseReportFilters(null), {});
  assert.deepEqual(parseReportFilters("x"), {});
  assert.deepEqual(parseReportFilters({ extra: 1 }), {});
});

test("query length is capped", () => {
  assert.equal(parseReportFilters({ q: "a".repeat(500) }).q?.length, 200);
});

test("defaults show everything", () => {
  assert.deepEqual(DEFAULT_REPORT_FILTERS, { q: "", status: "all", period: "all", onlyCritical: false });
});
