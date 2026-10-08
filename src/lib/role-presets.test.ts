import assert from "node:assert/strict";
import test from "node:test";
import { ROLE_PRESETS } from "./role-presets.ts";

const KNOWN = new Set([
  "patients.view", "patients.create", "patients.edit", "patients.delete",
  "reports.view", "reports.create", "reports.edit", "reports.approve", "reports.delete", "reports.print", "reports.export",
  "billing.manage", "users.manage",
]);

test("presets only use real permissions and never hand out user management or deletes", () => {
  for (const p of ROLE_PRESETS) {
    for (const [key, on] of Object.entries(p.permissions)) {
      assert.ok(KNOWN.has(key), `${p.key}: unknown permission ${key}`);
      assert.equal(on, true);
      assert.notEqual(key, "users.manage");
      assert.ok(!key.endsWith(".delete"), `${p.key}: ${key}`);
    }
  }
});

test("money access is limited to the roles that need it", () => {
  const withBilling = ROLE_PRESETS.filter((p) => p.permissions["billing.manage"]).map((p) => p.key).sort();
  assert.deepEqual(withBilling, ["accountant", "reception"]);
});

test("every preset can at least see something", () => {
  for (const p of ROLE_PRESETS) assert.ok(p.permissions["patients.view"] || p.permissions["reports.view"], p.key);
});
