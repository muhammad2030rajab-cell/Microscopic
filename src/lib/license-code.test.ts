import assert from "node:assert/strict";
import test from "node:test";
import {
  createLicenseKeyPair,
  formatMachineId,
  inspectLicense,
  issueLicense,
  machineBytesFromRaw,
  parseLicenseCode,
  parseMachineId,
  verifyLicense,
} from "./license-code.ts";

const pair = createLicenseKeyPair();
const other = createLicenseKeyPair();
const pcA = machineBytesFromRaw("11111111-2222-3333-4444-555555555555");
const pcB = machineBytesFromRaw("99999999-8888-7777-6666-000000000000");

test("a code verifies on the computer it was issued for and is never the same twice", () => {
  const a = issueLicense(pair.privatePem, pcA);
  const b = issueLicense(pair.privatePem, pcA);
  assert.match(a.code, /^RJB-[A-Z2-9]{6}(-[A-Z2-9]{1,6})+$/);
  assert.notEqual(a.code, b.code);
  assert.deepEqual(verifyLicense(a.code, pair.publicBase64, pcA), { ok: true, id: a.id });
});

test("the same code is rejected on any other computer", () => {
  const { code } = issueLicense(pair.privatePem, pcA);
  assert.deepEqual(verifyLicense(code, pair.publicBase64, pcB), { ok: false, reason: "MACHINE" });
});

test("a code from another key pair is rejected", () => {
  const c = issueLicense(other.privatePem, pcA);
  assert.deepEqual(verifyLicense(c.code, pair.publicBase64, pcA), { ok: false, reason: "SIGNATURE" });
});

test("changing the machine bytes inside a code breaks the signature (cannot re-target a code)", () => {
  const { code } = issueLicense(pair.privatePem, pcA);
  const bytes = parseLicenseCode(code)!;
  for (let i = 9; i < 17; i += 1) bytes[i] = pcB[i - 9];
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let bits = 0, value = 0, text = "";
  for (const b of bytes) {
    value = (value << 8) | b; bits += 8;
    while (bits >= 5) { text += alphabet[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) text += alphabet[(value << (5 - bits)) & 31];
  assert.deepEqual(verifyLicense(text, pair.publicBase64, pcB), { ok: false, reason: "SIGNATURE" });
});

test("changing any single character breaks it", () => {
  const { code } = issueLicense(pair.privatePem, pcA);
  const chars = [...code];
  let checked = 0;
  for (let i = 4; i < chars.length; i += 7) {
    if (chars[i] === "-") continue;
    const copy = [...chars];
    copy[i] = copy[i] === "A" ? "B" : "A";
    assert.equal(verifyLicense(copy.join(""), pair.publicBase64, pcA).ok, false, `position ${i}`);
    checked += 1;
  }
  assert.ok(checked > 10);
});

test("typing tolerance: lower case, spaces, missing dashes, missing RJB prefix", () => {
  const { code, id } = issueLicense(pair.privatePem, pcA);
  for (const variant of [code.toLowerCase(), code.replace(/-/g, " "), code.replace(/-/g, ""), code.slice(4), `  ${code}\n`]) {
    assert.deepEqual(verifyLicense(variant, pair.publicBase64, pcA), { ok: true, id });
  }
});

test("garbage, wrong length and wrong types are format errors; no key configured is reported", () => {
  const { code } = issueLicense(pair.privatePem, pcA);
  for (const bad of ["", "RJB-ABC", "hello world", 123, null, undefined, code.slice(0, -2), code + "AB", "0".repeat(130)]) {
    assert.deepEqual(verifyLicense(bad, pair.publicBase64, pcA), { ok: false, reason: "FORMAT" });
  }
  assert.equal(parseLicenseCode(code)?.length, 81);
  assert.deepEqual(verifyLicense(code, "", pcA), { ok: false, reason: "NO_KEY" });
});

test("old unbound (version 1) codes are not accepted", () => {
  assert.deepEqual(verifyLicense("RJB-" + "A".repeat(117), pair.publicBase64, pcA), { ok: false, reason: "FORMAT" });
});

test("machine ids: formatted for reading out, parsed back tolerantly, stable per computer", () => {
  const text = formatMachineId(pcA);
  assert.match(text, /^[0-9A-F]{4}(-[0-9A-F]{4}){3}$/);
  assert.deepEqual(parseMachineId(text), pcA);
  assert.deepEqual(parseMachineId(text.toLowerCase().replace(/-/g, " ")), pcA);
  assert.deepEqual(machineBytesFromRaw(" 11111111-2222-3333-4444-555555555555\n"), pcA);
  assert.notDeepEqual(pcA, pcB);
  for (const bad of ["", "ABCD", "ZZZZ-ZZZZ-ZZZZ-ZZZZ", 5, null]) assert.equal(parseMachineId(bad), null);
});

test("inspect shows which machine a code is for without needing that machine", () => {
  const { code, id } = issueLicense(pair.privatePem, pcA);
  const r = inspectLicense(code, pair.publicBase64);
  assert.ok(r.ok && r.id === id && formatMachineId(r.machine) === formatMachineId(pcA));
});
