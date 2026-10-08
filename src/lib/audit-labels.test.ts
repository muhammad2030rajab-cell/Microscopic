import assert from "node:assert/strict";
import test from "node:test";
import { auditActionLabel, auditGroupPatterns } from "./audit-labels.ts";

test("known actions are in Arabic, unknown ones are shown as they are", () => {
  assert.equal(auditActionLabel("report.approved"), "اعتماد تقرير");
  assert.equal(auditActionLabel("billing.payment_added"), "تسجيل دفعة");
  assert.equal(auditActionLabel("something.new"), "something.new");
});

test("filter groups become LIKE patterns; all / unknown means no filter", () => {
  assert.deepEqual(auditGroupPatterns("reports"), ["report.%"]);
  assert.deepEqual(auditGroupPatterns("users"), ["team.%", "user.%", "branch.%", "join.%"]);
  assert.deepEqual(auditGroupPatterns("all"), []);
  assert.deepEqual(auditGroupPatterns("nope"), []);
  assert.deepEqual(auditGroupPatterns(undefined), []);
});
