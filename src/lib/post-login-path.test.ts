import test from "node:test";
import assert from "node:assert/strict";
import { postLoginPath } from "./post-login-path.ts";

test("admins go to /admin, lab users to /lab", () => {
  assert.equal(postLoginPath({ type: "admin" }), "/admin");
  assert.equal(postLoginPath({ type: "lab" }), "/lab");
});

test("anything else has no destination (stay and show the welcome/login)", () => {
  assert.equal(postLoginPath({ type: "none" }), null);
  assert.equal(postLoginPath(null), null);
  assert.equal(postLoginPath(undefined), null);
});
