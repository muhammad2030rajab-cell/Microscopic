import assert from "node:assert/strict";
import test from "node:test";
import { createLicenseKeyPair, pemFromEnv, publicBase64FromPrivatePem, signLicenseToken, verifyLicenseToken } from "./license-token.ts";

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
  assert.equal(verifyLicenseToken(`${body}.${sig.slice(0, -2)}AA`, pair.publicBase64), null);
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
