/**
 * Offline activation codes, BOUND TO ONE COMPUTER. The seller signs a small payload with a PRIVATE key that never
 * leaves the seller's computer; the program carries only the PUBLIC key and checks the signature on the customer's
 * own machine. No server, no database of yours, no internet. Pure (only node:crypto), unit-tested with plain node.
 *
 * Code = version byte (2) + 8 random id bytes + 8 machine bytes + Ed25519 signature, in base32 (no 0/O/1/I):
 *   RJB-XXXXXX-XXXXXX-… (about 22 groups). The code only verifies on the computer whose id it was issued for,
 *   and never expires. The machine id is what the customer reads from the activation page: XXXX-XXXX-XXXX-XXXX.
 */
import { createHash, createPrivateKey, createPublicKey, generateKeyPairSync, randomBytes, sign, verify, type KeyObject } from "node:crypto";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // 32 symbols: no 0, 1, I, O
const PREFIX = "RJB";
const VERSION = 2;
const ID_BYTES = 8;
const MACHINE_BYTES = 8;
const PAYLOAD_BYTES = 1 + ID_BYTES + MACHINE_BYTES; // 17
const SIGNATURE_BYTES = 64;
const CODE_BYTES = PAYLOAD_BYTES + SIGNATURE_BYTES; // 81
const CODE_CHARS = Math.ceil((CODE_BYTES * 8) / 5); // 130
const DOMAIN = Buffer.from("RJB-LICENSE-v2:");
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

/** The 8 machine bytes for an operating-system machine identifier (see machine-id.server.ts). */
export function machineBytesFromRaw(raw: string): Uint8Array {
  const hash = createHash("sha256").update(`RJB-MACHINE-v1:${raw.trim().toLowerCase()}`).digest();
  return Uint8Array.from(hash.subarray(0, MACHINE_BYTES));
}

/** "ABCD-EF01-2345-6789": what the customer reads out and the seller types. */
export function formatMachineId(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("hex").toUpperCase().match(/.{4}/g)!.join("-");
}

/** Tolerates lower case, spaces and missing dashes; returns the 8 bytes or null. */
export function parseMachineId(input: unknown): Uint8Array | null {
  if (typeof input !== "string") return null;
  const clean = input.replace(/[\s-]/g, "");
  if (!/^[0-9a-fA-F]{16}$/.test(clean)) return null;
  return Uint8Array.from(Buffer.from(clean, "hex"));
}

/** Makes one code for one computer. `id` is random unless given (tests). */
export function issueLicense(privatePem: string, machine: Uint8Array, id: Uint8Array = randomBytes(ID_BYTES)): { code: string; id: string } {
  if (id.length !== ID_BYTES) throw new Error("bad id length");
  if (machine.length !== MACHINE_BYTES) throw new Error("bad machine length");
  const payload = Buffer.concat([Buffer.from([VERSION]), id, machine]);
  const signature = sign(null, Buffer.concat([DOMAIN, payload]), createPrivateKey(privatePem));
  return { code: group(toBase32(Buffer.concat([payload, signature]))), id: Buffer.from(id).toString("hex") };
}

export type LicenseInspect =
  | { ok: true; id: string; machine: Uint8Array }
  | { ok: false; reason: "FORMAT" | "SIGNATURE" | "NO_KEY" };

/** Checks the signature only (no computer check): what the seller's `verify` command uses. */
export function inspectLicense(code: unknown, publicKeyBase64: string): LicenseInspect {
  if (!publicKeyBase64) return { ok: false, reason: "NO_KEY" };
  const bytes = parseLicenseCode(code);
  if (!bytes || bytes[0] !== VERSION) return { ok: false, reason: "FORMAT" };
  const payload = bytes.slice(0, PAYLOAD_BYTES);
  const signature = bytes.slice(PAYLOAD_BYTES, CODE_BYTES);
  try {
    const good = verify(null, Buffer.concat([DOMAIN, payload]), publicKeyFromBase64(publicKeyBase64), signature);
    return good
      ? { ok: true, id: Buffer.from(payload.slice(1, 1 + ID_BYTES)).toString("hex"), machine: payload.slice(1 + ID_BYTES) }
      : { ok: false, reason: "SIGNATURE" };
  } catch {
    return { ok: false, reason: "SIGNATURE" };
  }
}

export type LicenseCheck = { ok: true; id: string } | { ok: false; reason: "FORMAT" | "SIGNATURE" | "NO_KEY" | "MACHINE" };

/** A code is valid only if it is signed by the seller AND was issued for THIS computer. */
export function verifyLicense(code: unknown, publicKeyBase64: string, machine: Uint8Array): LicenseCheck {
  const r = inspectLicense(code, publicKeyBase64);
  if (!r.ok) return r;
  if (Buffer.compare(Buffer.from(r.machine), Buffer.from(machine)) !== 0) return { ok: false, reason: "MACHINE" };
  return { ok: true, id: r.id };
}
