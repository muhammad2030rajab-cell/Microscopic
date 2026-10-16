import assert from "node:assert/strict";
import test from "node:test";
import { checkOfflineKey, createLicenseKeyPair, formatDeviceId, isOfflineLicense, looksLikeSignedKey, parseDeviceId, pemFromEnv, publicBase64FromPrivatePem, signLicenseToken, verifyLicenseToken } from "./license-token.ts";

const pair = createLicenseKeyPair();
const other = createLicenseKeyPair();
const fp = "a".repeat(64);

test("a signed token verifies with the matching public key and carries its payload", () => {
  const token = signLicenseToken(pair.privatePem, { lic: "lic-1", fp, iat: 1_700_000_000 });
  assert.deepEqual(verifyLicenseToken(token, pair.publicBase64), { v: 1, lic: "lic-1", fp, iat: 1_700_000_000 });
});

test("the server derives the same public key from its private key", () => {
  assert.equal(publicBase64FromPrivatePem(pair.privatePem), pair.publicBase64);
});

test("a token from another key pair, or with any edit, is rejected", () => {
  const token = signLicenseToken(pair.privatePem, { lic: "lic-1", fp });
  assert.equal(verifyLicenseToken(token, other.publicBase64), null);
  const [body, sig] = token.split(".");
  const forged = Buffer.from(JSON.stringify({ v: 1, lic: "lic-2", fp, iat: 1 })).toString("base64url");
  assert.equal(verifyLicenseToken(`${forged}.${sig}`, pair.publicBase64), null);
  // Always change the signature: swap its first character for a different one
  // (the old "…AA" suffix left the token unchanged ~1 run in 64 and flaked).
  const tampered = (sig[0] === "A" ? "B" : "A") + sig.slice(1);
  assert.equal(verifyLicenseToken(`${body}.${tampered}`, pair.publicBase64), null);
});

test("garbage never verifies and never throws", () => {
  const token = signLicenseToken(pair.privatePem, { lic: "x", fp });
  for (const bad of ["", "abc", "a.b.c", ".", 5, null, undefined, token + "x.y", "x".repeat(3000)]) {
    assert.equal(verifyLicenseToken(bad, pair.publicBase64), null);
  }
  assert.equal(verifyLicenseToken(token, ""), null);
});

test("LICENSE_PRIVATE_KEY may be plain PEM or base64 of the PEM", () => {
  assert.equal(pemFromEnv(pair.privatePem), pair.privatePem.trim());
  assert.equal(pemFromEnv(Buffer.from(pair.privatePem).toString("base64")), pair.privatePem);
});

test("offline key: genuine and for this device is accepted, even re-wrapped by a chat app", () => {
  const key = signLicenseToken(pair.privatePem, { lic: "OFF-20261009-AB12", fp });
  const wrapped = `${key.slice(0, 50)}\n ${key.slice(50, 120)}\r\n${key.slice(120)}`;
  assert.deepEqual(checkOfflineKey(wrapped, pair.publicBase64, fp), { ok: true, payload: verifyLicenseToken(key, pair.publicBase64)! });
});

test("offline key: another device, another signer, a server-style token or garbage are refused with the right reason", () => {
  const key = signLicenseToken(pair.privatePem, { lic: "OFF-1", fp });
  assert.deepEqual(checkOfflineKey(key, pair.publicBase64, "b".repeat(64)), { ok: false, error: "LICENSE_WRONG_DEVICE" });
  assert.deepEqual(checkOfflineKey(key, other.publicBase64, fp), { ok: false, error: "LICENSE_INVALID" });
  assert.deepEqual(checkOfflineKey(signLicenseToken(pair.privatePem, { lic: "lic-1", fp }), pair.publicBase64, fp), { ok: false, error: "LICENSE_INVALID" });
  assert.deepEqual(checkOfflineKey("hello", pair.publicBase64, fp), { ok: false, error: "LICENSE_INVALID" });
});

test("only hand-signed ids are 'offline', so the server is never asked about them", () => {
  assert.equal(isOfflineLicense("OFF-1"), true);
  assert.equal(isOfflineLicense("5f0c-server-license"), false);
});

test("a signed key is told apart from the short online code", () => {
  assert.equal(looksLikeSignedKey("ABCDE-12345"), false);
  assert.equal(looksLikeSignedKey(signLicenseToken(pair.privatePem, { lic: "OFF-1", fp })), true);
});

test("device id: formatted for reading, parsed back from whatever the customer pasted", () => {
  const shown = formatDeviceId(fp);
  assert.match(shown, /^([A-F0-9]{8}-){7}[A-F0-9]{8}$/);
  assert.equal(parseDeviceId(shown), fp);
  assert.equal(parseDeviceId(` ${shown.toLowerCase().replaceAll("-", " ")}\n`), fp);
  assert.equal(parseDeviceId("1234"), null);
  assert.equal(parseDeviceId("z".repeat(64)), null);
});
