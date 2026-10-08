/**
 * Activation tokens. Your license server (the deployment that holds LICENSE_PRIVATE_KEY) signs a small token
 * that says "license X is activated on machine Y". The customer's program carries only the PUBLIC key, so it can
 * check a token on its own, offline, but can never make one. Pure (only node:crypto), unit-tested with plain node.
 */
import { createPrivateKey, createPublicKey, generateKeyPairSync, sign, verify, type KeyObject } from "node:crypto";

const DOMAIN = Buffer.from("RJB-LICENSE-TOKEN-v1:");
// DER prefix of an Ed25519 SubjectPublicKeyInfo; the raw 32-byte key follows.
const SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");

export type LicenseTokenPayload = { v: 1; lic: string; fp: string; iat: number };

const b64url = (bytes: Uint8Array) => Buffer.from(bytes).toString("base64url");

export function publicKeyFromBase64(raw: string): KeyObject {
  return createPublicKey({ key: Buffer.concat([SPKI_PREFIX, Buffer.from(raw, "base64")]), format: "der", type: "spki" });
}

/** A fresh key pair. `privatePem` stays on your license server / computer; `publicBase64` goes into the program. */
export function createLicenseKeyPair(): { privatePem: string; publicBase64: string } {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  return { privatePem: privateKey.export({ format: "pem", type: "pkcs8" }).toString(), publicBase64: rawPublicKey(publicKey) };
}

function rawPublicKey(key: KeyObject): string {
  const der = key.export({ format: "der", type: "spki" });
  return Buffer.from(der.subarray(der.length - 32)).toString("base64");
}

/** The public key (base64) that matches a private PEM, so the server never needs it configured separately. */
export function publicBase64FromPrivatePem(privatePem: string): string {
  return rawPublicKey(createPublicKey(createPrivateKey(privatePem)));
}

/** LICENSE_PRIVATE_KEY is stored base64-encoded (one line, safe for environment variables). */
export function pemFromEnv(value: string): string {
  const text = value.trim();
  return text.includes("BEGIN") ? text : Buffer.from(text, "base64").toString("utf8");
}

export function signLicenseToken(privatePem: string, payload: { lic: string; fp: string; iat?: number }): string {
  const body: LicenseTokenPayload = { v: 1, lic: payload.lic, fp: payload.fp, iat: payload.iat ?? Math.floor(Date.now() / 1000) };
  const json = Buffer.from(JSON.stringify(body));
  const signature = sign(null, Buffer.concat([DOMAIN, json]), createPrivateKey(privatePem));
  return `${b64url(json)}.${b64url(signature)}`;
}

/** The payload if the token was signed by the matching private key, else null. */
export function verifyLicenseToken(token: unknown, publicBase64: string): LicenseTokenPayload | null {
  if (typeof token !== "string" || !publicBase64 || token.length > 2000) return null;
  const [body, sig, extra] = token.split(".");
  if (!body || !sig || extra !== undefined) return null;
  try {
    const json = Buffer.from(body, "base64url");
    if (!verify(null, Buffer.concat([DOMAIN, json]), publicKeyFromBase64(publicBase64), Buffer.from(sig, "base64url"))) return null;
    const p = JSON.parse(json.toString("utf8")) as Partial<LicenseTokenPayload>;
    if (p.v !== 1 || typeof p.lic !== "string" || typeof p.fp !== "string" || typeof p.iat !== "number") return null;
    return { v: 1, lic: p.lic, fp: p.fp, iat: p.iat };
  } catch {
    return null;
  }
}
