/**
 * Offline activation codes. The seller signs a small payload with a PRIVATE key that never leaves the seller's
 * computer; the program carries only the PUBLIC key and checks the signature on the customer's own machine.
 * No server, no database of yours, no internet. Pure (only node:crypto), unit-tested with plain node.
 *
 * Code = version byte + 8 random id bytes + Ed25519 signature, written in base32 (no 0/O/1/I), grouped:
 *   RJB-XXXXXX-XXXXXX-… (about 20 groups). One code works on any machine and never expires.
 */
import { createPrivateKey, createPublicKey, generateKeyPairSync, randomBytes, sign, verify, type KeyObject } from "node:crypto";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // 32 symbols: no 0, 1, I, O
const PREFIX = "RJB";
const VERSION = 1;
const ID_BYTES = 8;
const PAYLOAD_BYTES = 1 + ID_BYTES;
const SIGNATURE_BYTES = 64;
const CODE_BYTES = PAYLOAD_BYTES + SIGNATURE_BYTES; // 73
const CODE_CHARS = Math.ceil((CODE_BYTES * 8) / 5); // 117
const DOMAIN = Buffer.from("RJB-LICENSE-v1:");
// DER prefix of an Ed25519 SubjectPublicKeyInfo; the raw 32-byte key follows.
const SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");

function toBase32(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const b of bytes) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

function fromBase32(text: string): Uint8Array | null {
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of text) {
    const index = ALPHABET.indexOf(ch);
    if (index < 0) return null;
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Uint8Array.from(out);
}

function group(text: string): string {
  return `${PREFIX}-${text.match(/.{1,6}/g)!.join("-")}`;
}

/** Tolerates lower case, spaces, dashes and the RJB prefix; returns the raw code bytes or null. */
export function parseLicenseCode(input: unknown): Uint8Array | null {
  if (typeof input !== "string") return null;
  let clean = input.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (clean.length === CODE_CHARS + PREFIX.length && clean.startsWith(PREFIX)) clean = clean.slice(PREFIX.length);
  if (clean.length !== CODE_CHARS) return null;
  const bytes = fromBase32(clean);
  if (!bytes || bytes.length < CODE_BYTES) return null;
  return bytes.slice(0, CODE_BYTES);
}

export function publicKeyFromBase64(raw: string): KeyObject {
  return createPublicKey({ key: Buffer.concat([SPKI_PREFIX, Buffer.from(raw, "base64")]), format: "der", type: "spki" });
}

/** A fresh key pair: keep `privatePem` secret on the seller's machine; put `publicBase64` in the program. */
export function createLicenseKeyPair(): { privatePem: string; publicBase64: string } {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const der = publicKey.export({ format: "der", type: "spki" });
  return {
    privatePem: privateKey.export({ format: "pem", type: "pkcs8" }).toString(),
    publicBase64: Buffer.from(der.subarray(der.length - 32)).toString("base64"),
  };
}

/** Makes one code. `id` is random unless given (tests). */
export function issueLicense(privatePem: string, id: Uint8Array = randomBytes(ID_BYTES)): { code: string; id: string } {
  if (id.length !== ID_BYTES) throw new Error("bad id length");
  const payload = Buffer.concat([Buffer.from([VERSION]), id]);
  const signature = sign(null, Buffer.concat([DOMAIN, payload]), createPrivateKey(privatePem));
  return { code: group(toBase32(Buffer.concat([payload, signature]))), id: Buffer.from(id).toString("hex") };
}

export type LicenseCheck = { ok: true; id: string } | { ok: false; reason: "FORMAT" | "SIGNATURE" | "NO_KEY" };

export function verifyLicense(code: unknown, publicKeyBase64: string): LicenseCheck {
  if (!publicKeyBase64) return { ok: false, reason: "NO_KEY" };
  const bytes = parseLicenseCode(code);
  if (!bytes || bytes[0] !== VERSION) return { ok: false, reason: "FORMAT" };
  const payload = bytes.slice(0, PAYLOAD_BYTES);
  const signature = bytes.slice(PAYLOAD_BYTES, CODE_BYTES);
  try {
    const good = verify(null, Buffer.concat([DOMAIN, payload]), publicKeyFromBase64(publicKeyBase64), signature);
    return good ? { ok: true, id: Buffer.from(payload.slice(1)).toString("hex") } : { ok: false, reason: "SIGNATURE" };
  } catch {
    return { ok: false, reason: "SIGNATURE" };
  }
}
