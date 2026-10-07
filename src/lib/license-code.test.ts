import assert from "node:assert/strict";
import test from "node:test";
import { createLicenseKeyPair, issueLicense, parseLicenseCode, verifyLicense } from "./license-code.ts";

const pair = createLicenseKeyPair();
const other = createLicenseKeyPair();

test("an issued code verifies with the matching public key and is never the same twice", () => {
  const a = issueLicense(pair.privatePem);
  const b = issueLicense(pair.privatePem);
  assert.match(a.code, /^RJB-[A-Z2-9]{6}(-[A-Z2-9]{1,6})+$/);
  assert.notEqual(a.code, b.code);
  const r = verifyLicense(a.code, pair.publicBase64);
  assert.deepEqual(r, { ok: true, id: a.id });
});

test("a code from another key pair is rejected", () => {
  const c = issueLicense(other.privatePem);
  assert.deepEqual(verifyLicense(c.code, pair.publicBase64), { ok: false, reason: "SIGNATURE" });
});

test("changing any single character breaks it", () => {
  const { code } = issueLicense(pair.privatePem);
  const chars = [...code];
  let checked = 0;
  for (let i = 4; i < chars.length; i += 7) {
    if (chars[i] === "-") continue;
    const copy = [...chars];
    copy[i] = copy[i] === "A" ? "B" : "A";
    const r = verifyLicense(copy.join(""), pair.publicBase64);
    assert.equal(r.ok, false, `position ${i}`);
    checked += 1;
  }
  assert.ok(checked > 10);
});

test("typing tolerance: lower case, spaces, missing dashes, missing RJB prefix", () => {
  const { code, id } = issueLicense(pair.privatePem);
  for (const variant of [code.toLowerCase(), code.replace(/-/g, " "), code.replace(/-/g, ""), code.slice(4), `  ${code}\n`]) {
    assert.deepEqual(verifyLicense(variant, pair.publicBase64), { ok: true, id });
  }
});

test("garbage, wrong length and wrong types are format errors; no key configured is reported", () => {
  const { code } = issueLicense(pair.privatePem);
  for (const bad of ["", "RJB-ABC", "hello world", 123, null, undefined, code.slice(0, -2), code + "AB", "0".repeat(117)]) {
    assert.deepEqual(verifyLicense(bad, pair.publicBase64), { ok: false, reason: "FORMAT" });
  }
  assert.equal(parseLicenseCode(code)?.length, 73);
  assert.deepEqual(verifyLicense(code, ""), { ok: false, reason: "NO_KEY" });
});
