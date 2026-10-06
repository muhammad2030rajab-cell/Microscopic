import test from "node:test";
import assert from "node:assert/strict";
import { isHomePath } from "./native-back.ts";

test("home screens are the dashboard, the welcome page and login, with or without a trailing slash", () => {
  assert.equal(isHomePath("/lab"), true);
  assert.equal(isHomePath("/lab/"), true);
  assert.equal(isHomePath("/"), true);
  assert.equal(isHomePath("/login"), true);
});

test("every other screen goes back instead of leaving the app", () => {
  assert.equal(isHomePath("/reports"), false);
  assert.equal(isHomePath("/reports/abc"), false);
  assert.equal(isHomePath("/settings"), false);
});
