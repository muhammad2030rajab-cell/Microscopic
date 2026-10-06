import assert from "node:assert/strict";
import { test } from "node:test";
import { groupErrorMessage, MAX_GROUP_NAME, MAX_GROUP_TESTS, normalizeGroupInput, parseCatalogIds, resolveGroupTests } from "./test-groups.ts";

test("normalizeGroupInput: trims and collapses the name, drops blank / repeated ids, keeps order", () => {
  assert.deepEqual(normalizeGroupInput("  فحص   شامل  ", ["b", " a ", "b", "", 5, "c"]), { ok: true, name: "فحص شامل", catalogIds: ["b", "a", "c"] });
});

test("normalizeGroupInput: refuses a missing name, a long name, no tests, or too many tests", () => {
  assert.deepEqual(normalizeGroupInput("   ", ["a"]), { ok: false, error: "GROUP_NAME_REQUIRED" });
  assert.deepEqual(normalizeGroupInput(undefined, ["a"]), { ok: false, error: "GROUP_NAME_REQUIRED" });
  assert.deepEqual(normalizeGroupInput("x".repeat(MAX_GROUP_NAME + 1), ["a"]), { ok: false, error: "GROUP_NAME_TOO_LONG" });
  assert.equal(normalizeGroupInput("x".repeat(MAX_GROUP_NAME), ["a"]).ok, true);
  assert.deepEqual(normalizeGroupInput("g", []), { ok: false, error: "GROUP_TESTS_REQUIRED" });
  assert.deepEqual(normalizeGroupInput("g", "a"), { ok: false, error: "GROUP_TESTS_REQUIRED" });
  const many = Array.from({ length: MAX_GROUP_TESTS + 1 }, (_, i) => `id${i}`);
  assert.deepEqual(normalizeGroupInput("g", many), { ok: false, error: "GROUP_TOO_MANY_TESTS" });
});

test("resolveGroupTests: group order, only active tests, counts what could not be used", () => {
  const catalog = [
    { id: "a", is_active: true }, { id: "b", is_active: false }, { id: "c", is_active: true }, { id: "d", is_active: true },
  ];
  const out = resolveGroupTests(["c", "b", "gone", "a"], catalog);
  assert.deepEqual(out.tests.map((t) => t.id), ["c", "a"]);
  assert.equal(out.missing, 2);
  assert.deepEqual(resolveGroupTests([], catalog), { tests: [], missing: 0 });
});

test("parseCatalogIds: arrays, json text, and junk", () => {
  assert.deepEqual(parseCatalogIds(["a", "b"]), ["a", "b"]);
  assert.deepEqual(parseCatalogIds('["a","b"]'), ["a", "b"]);
  assert.deepEqual(parseCatalogIds(["a", 3, "", null, "c"]), ["a", "c"]);
  assert.deepEqual(parseCatalogIds("not json"), []);
  assert.deepEqual(parseCatalogIds(null), []);
  assert.deepEqual(parseCatalogIds({ a: 1 }), []);
});

test("groupErrorMessage: known codes get an Arabic message, anything else a generic one", () => {
  assert.match(groupErrorMessage(new Error("GROUP_NAME_TAKEN")), /بنفس الاسم/);
  assert.match(groupErrorMessage(new Error("GROUP_TESTS_REQUIRED")), /تحليل واحد/);
  assert.match(groupErrorMessage(new Error("boom")), /تعذر حفظ/);
  assert.match(groupErrorMessage(undefined), /تعذر حفظ/);
});
