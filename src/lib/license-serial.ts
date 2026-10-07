import { createHash, randomBytes } from "node:crypto";

/**
 * Registration numbers ("serials"): RJB-XXXX-XXXX-XXXX-XXXX. One per sale. Pure helpers (only node:crypto),
 * unit-tested with plain node. The same alphabet as activation codes (no 0/O/1/I).
 */
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const SERIAL_CHARS = 16;

export function generateSerial(): string {
  const bytes = randomBytes(SERIAL_CHARS);
  let text = "";
  for (const b of bytes) text += ALPHABET[b & 31];
  return `RJB-${text.match(/.{4}/g)!.join("-")}`;
}

/** Canonical form of what a customer typed, or null if it is not a serial (tolerates case, spaces, dashes). */
export function normalizeSerial(input: unknown): string | null {
  if (typeof input !== "string") return null;
  let clean = input.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (clean.startsWith("RJB")) clean = clean.slice(3);
  if (clean.length !== SERIAL_CHARS) return null;
  for (const ch of clean) if (!ALPHABET.includes(ch)) return null;
  return `RJB-${clean.match(/.{4}/g)!.join("-")}`;
}

export const hashSerial = (canonical: string): string => createHash("sha256").update(`RJB-SERIAL-v1:${canonical}`).digest("hex");

export type SerialRow = { machine: string | null; disabled: boolean } | null;
export type ActivationDecision = "NOT_FOUND" | "BIND" | "REISSUE" | "USED_ELSEWHERE";

/** What to do when a computer presents a serial. First computer wins; the same computer may ask again (reinstall). */
export function decideActivation(row: SerialRow, machine: string): ActivationDecision {
  if (!row || row.disabled) return "NOT_FOUND";
  if (row.machine === null) return "BIND";
  return row.machine === machine ? "REISSUE" : "USED_ELSEWHERE";
}
