import assert from "node:assert/strict";
import test from "node:test";
import { authRateLimit, positiveInt, rateLimitMessage, signInRule } from "./rate-limit.ts";

test("sign-in rule defaults to 10 attempts per 5 minutes", () => {
  assert.deepEqual(signInRule({}), { window: 300, max: 10 });
});

test("env overrides apply; junk values fall back to the defaults", () => {
  assert.deepEqual(signInRule({ AUTH_SIGNIN_MAX: "5", AUTH_SIGNIN_WINDOW_SECONDS: "600" }), { window: 600, max: 5 });
  for (const bad of ["", "0", "-3", "abc", "2.5", undefined]) {
    assert.equal(positiveInt(bad, 7), 7);
  }
});

test("Postgres uses shared database counters, PGLite/hub uses memory", () => {
  assert.equal(authRateLimit({}, true).storage, "database");
  assert.equal(authRateLimit({}, false).storage, "memory");
  assert.equal(authRateLimit({}, true).enabled, true);
});

test("sign-in and sign-up have their own, stricter rules than the global one", () => {
  const cfg = authRateLimit({}, true);
  assert.ok(cfg.customRules["/sign-in/email"].max < cfg.max);
  assert.ok(cfg.customRules["/sign-up/email"].max < cfg.max);
});

test("rateLimitMessage rounds seconds up to minutes and survives bad input", () => {
  assert.match(rateLimitMessage(30), /بعد دقيقة/);
  assert.match(rateLimitMessage(61), /2 دقيقة/);
  assert.match(rateLimitMessage("240"), /4 دقيقة/);
  for (const bad of [undefined, null, "x", 0, -1]) assert.match(rateLimitMessage(bad as never), /استنى/);
});
