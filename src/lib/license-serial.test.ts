import assert from "node:assert/strict";
import test from "node:test";
import { decideActivation, generateSerial, hashSerial, normalizeSerial } from "./license-serial.ts";

test("generated serials have the expected shape and are unique", () => {
  const a = generateSerial();
  assert.match(a, /^RJB(-[A-Z2-9]{4}){4}$/);
  assert.notEqual(a, generateSerial());
  assert.equal(normalizeSerial(a), a);
});

test("typing tolerance: lower case, spaces, missing dashes and prefix", () => {
  const s = generateSerial();
  for (const v of [s.toLowerCase(), s.replace(/-/g, " "), s.replace(/-/g, ""), s.slice(4), `  ${s}\n`]) assert.equal(normalizeSerial(v), s);
});

test("anything else is not a serial (including a long activation code)", () => {
  for (const bad of ["", "RJB-ABC", "hello", 5, null, undefined, generateSerial() + "AB", "RJB-" + "A".repeat(130), "0000-0000-0000-0000"]) assert.equal(normalizeSerial(bad), null);
});

test("hash is stable and differs per serial", () => {
  const a = generateSerial();
  assert.equal(hashSerial(a), hashSerial(a));
  assert.notEqual(hashSerial(a), hashSerial(generateSerial()));
});

test("activation: first computer binds, same computer may repeat, any other is refused, disabled/unknown are not found", () => {
  assert.equal(decideActivation(null, "A"), "NOT_FOUND");
  assert.equal(decideActivation({ machine: null, disabled: true }, "A"), "NOT_FOUND");
  assert.equal(decideActivation({ machine: null, disabled: false }, "A"), "BIND");
  assert.equal(decideActivation({ machine: "A", disabled: false }, "A"), "REISSUE");
  assert.equal(decideActivation({ machine: "A", disabled: false }, "B"), "USED_ELSEWHERE");
});
