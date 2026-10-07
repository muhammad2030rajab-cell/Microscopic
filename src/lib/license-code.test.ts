import assert from "node:assert/strict";
import test from "node:test";
import {
  createLicenseKeyPair,
  deviceIdFromMachineGuid,
  formatDeviceId,
  issueLicense,
  parseDeviceId,
  parseLicenseCode,
  verifyLicense,
} from "./license-code.ts";

const pair = createLicenseKeyPair();
const other = createLicenseKeyPair();
const deviceA = deviceIdFromMachineGuid("11111111-2222-3333-4444-555555555555");
const deviceB = deviceIdFromMachineGuid("99999999-8888-7777-6666-000000000000");

test("device id is stable, 16 hex, differs per machine, ignores case/whitespace of the guid", () => {
  assert.match(deviceA, /^[0-9a-f]{16}$/);
  assert.equal(deviceA, deviceIdFromMachineGuid("  11111111-2222-3333-4444-555555555555\n".toUpperCase()));
  assert.notEqual(deviceA, deviceB);
});

test("device id formatting and parsing round-trip, and tolerate what a customer pastes", () => {
  const shown = formatDeviceId(deviceA);
  assert.match(shown, /^[0-9A-F]{4}(-[0-9A-F]{4}){3}$/);
  assert.equal(parseDeviceId(shown), deviceA);
  assert.equal(parseDeviceId(shown.toLowerCase().replace(/-/g, " ")), deviceA);
  assert.equal(parseDeviceId(`رقم الجهاز: ${shown}`), deviceA);
  for (const bad of ["", "1234", "zzzz-zzzz-zzzz-zzzz", 5, null, undefined]) assert.equal(parseDeviceId(bad), null);
});

test("a code verifies on its own device, and is never the same twice", () => {
  const a = issueLicense(pair.privatePem, deviceA);
  const b = issueLicense(pair.privatePem, deviceA);
  assert.match(a.code, /^RJB-[A-Z2-9]{6}(-[A-Z2-9]{1,6})+$/);
  assert.notEqual(a.code, b.code);
  assert.deepEqual(verifyLicense(a.code, pair.publicBase64, deviceA), { ok: true, id: a.id });
});

test("the same code is refused on another computer, or when the device id cannot be read", () => {
  const { code } = issueLicense(pair.privatePem, deviceA);
  assert.deepEqual(verifyLicense(code, pair.publicBase64, deviceB), { ok: false, reason: "DEVICE" });
  assert.deepEqual(verifyLicense(code, pair.publicBase64, null), { ok: false, reason: "DEVICE" });
});

test("a code from another key pair is rejected", () => {
  const c = issueLicense(other.privatePem, deviceA);
  assert.deepEqual(verifyLicense(c.code, pair.publicBase64, deviceA), { ok: false, reason: "SIGNATURE" });
});

test("changing the device bytes inside a code (to retarget it) breaks the signature", () => {
  const { code } = issueLicense(pair.privatePem, deviceA);
  const forged = issueLicense(other.privatePem, deviceB).code; // attacker signs for B with their own key
  assert.equal(verifyLicense(forged, pair.publicBase64, deviceB).ok, false);
  const chars = [...code.replace(/-/g, "")];
  let checked = 0;
  for (let i = 3; i < chars.length; i += 5) {
    const copy = [...chars];
    copy[i] = copy[i] === "A" ? "B" : "A";
    assert.equal(verifyLicense(copy.join(""), pair.publicBase64, deviceA).ok, false, `position ${i}`);
    checked += 1;
  }
  assert.ok(checked > 15);
});

test("typing tolerance: lower case, spaces, missing dashes, missing RJB prefix", () => {
  const { code, id } = issueLicense(pair.privatePem, deviceA);
  for (const variant of [code.toLowerCase(), code.replace(/-/g, " "), code.replace(/-/g, ""), code.slice(4), `  ${code}\n`]) {
    assert.deepEqual(verifyLicense(variant, pair.publicBase64, deviceA), { ok: true, id });
  }
});

test("garbage, wrong length, wrong types and old v1-length codes are format errors; no key is reported", () => {
  const { code } = issueLicense(pair.privatePem, deviceA);
  for (const bad of ["", "RJB-ABC", "hello world", 123, null, undefined, code.slice(0, -2), code + "AB", "0".repeat(117), "A".repeat(117)]) {
    assert.deepEqual(verifyLicense(bad, pair.publicBase64, deviceA), { ok: false, reason: "FORMAT" });
  }
  assert.equal(parseLicenseCode(code)?.length, 81);
  assert.deepEqual(verifyLicense(code, "", deviceA), { ok: false, reason: "NO_KEY" });
});

test("issuing for a malformed device id throws", () => {
  assert.throws(() => issueLicense(pair.privatePem, "nope"));
});
