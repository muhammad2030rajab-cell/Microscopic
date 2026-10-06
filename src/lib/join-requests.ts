/**
 * Join-code flow, the parts with no database or network: the code itself, request validation and the
 * brute-force limiter. Pure, so they are unit-tested and the same rules run in the browser and on the server.
 */
import { passwordPolicyError } from "./password-policy.ts";
import { normalizeNumerals } from "./numerals.ts";

/** No 0/O, 1/I/L: the code is read aloud and typed from paper. 31 letters/digits. */
export const JOIN_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const JOIN_CODE_LENGTH = 10;
export const JOIN_DEFAULT_ROLE = "viewer" as const;
export type JoinRole = "supervisor" | "technician" | "reviewer" | "viewer";

const VIEW = ["patients.view", "reports.view", "reports.print"];
const WORK = ["patients.view", "patients.create", "patients.edit", "reports.view", "reports.create", "reports.edit", "reports.print"];
const PRESETS: Record<JoinRole, string[]> = {
  viewer: VIEW,
  reviewer: [...VIEW, "reports.approve", "reports.export"],
  technician: WORK,
  supervisor: [...WORK, "reports.approve", "reports.export"],
};

/** What a newly approved person may do, by role. Never includes user management or deleting anything. */
export function presetPermissions(role: string): Record<string, true> {
  const list = PRESETS[role as JoinRole] ?? PRESETS.viewer;
  return Object.fromEntries(list.map((p) => [p, true as const]));
}

export function isJoinRole(role: unknown): role is JoinRole {
  return typeof role === "string" && role in PRESETS;
}

/** At most this many people may wait for approval at once (stops a flood of fake requests). */
export const MAX_PENDING_REQUESTS = 25;

/** A fresh random code (uniform: bytes that would skew the choice are thrown away). */
export function generateJoinCode(randomBytes: (n: number) => Uint8Array = (n) => globalThis.crypto.getRandomValues(new Uint8Array(n))): string {
  const limit = 256 - (256 % JOIN_CODE_ALPHABET.length);
  let out = "";
  while (out.length < JOIN_CODE_LENGTH) {
    for (const b of randomBytes(JOIN_CODE_LENGTH * 2)) {
      if (b < limit && out.length < JOIN_CODE_LENGTH) out += JOIN_CODE_ALPHABET[b % JOIN_CODE_ALPHABET.length];
    }
  }
  return out;
}

/** "ABCDE-FGHJK": how the code is shown. */
export function formatJoinCode(code: string): string {
  return code.length === JOIN_CODE_LENGTH ? `${code.slice(0, 5)}-${code.slice(5)}` : code;
}

/** Whatever was typed or pasted (any case, spaces, dashes, Arabic digits) -> the clean code, or null. */
export function normalizeJoinCode(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const clean = normalizeNumerals(input).toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (clean.length !== JOIN_CODE_LENGTH) return null;
  for (const ch of clean) if (!JOIN_CODE_ALPHABET.includes(ch)) return null;
  return clean;
}

/** SHA-256 (hex) of the clean code. Only this is stored. */
export async function hashJoinCode(code: string): Promise<string> {
  const bytes = new TextEncoder().encode(`microscopic-join:${code}`);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

export type JoinRequestInput = { ok: true; username: string; name: string } | { ok: false; error: string };

/** Same username rule as accounts the owner creates by hand. */
export function validateJoinRequest(input: { username: unknown; name: unknown; password: unknown }): JoinRequestInput {
  const username = typeof input.username === "string" ? input.username.trim().toLowerCase() : "";
  if (!/^[a-z0-9._-]{3,40}$/.test(username)) {
    return { ok: false, error: "اسم المستخدم يجب أن يكون 3-40 حرفًا إنجليزيًا أو أرقامًا أو ._- فقط" };
  }
  const name = (typeof input.name === "string" ? input.name.replace(/\s+/g, " ").trim() : "") || username;
  if (name.length > 60) return { ok: false, error: "الاسم أطول من 60 حرف" };
  const passwordError = typeof input.password === "string" ? passwordPolicyError(input.password) : "اكتب كلمة المرور";
  if (passwordError) return { ok: false, error: passwordError };
  return { ok: true, username, name };
}

/**
 * Counts FAILED attempts per key (e.g. a visitor's address) inside a sliding window; once `max` have
 * happened the key is blocked until the oldest one ages out. In-memory (per server instance), like the
 * limiter in account-check.ts: it slows guessing, the manager's approval is the real gate.
 */
export function createAttemptLimiter(options: { max: number; windowMs: number; maxKeys?: number }) {
  const { max, windowMs, maxKeys = 5000 } = options;
  const failures = new Map<string, number[]>();
  const fresh = (key: string, now: number) => {
    const list = (failures.get(key) ?? []).filter((t) => now - t < windowMs);
    if (list.length) failures.set(key, list);
    else failures.delete(key);
    return list;
  };
  return {
    isBlocked(key: string, now: number = Date.now()): boolean {
      return fresh(key, now).length >= max;
    },
    recordFailure(key: string, now: number = Date.now()): void {
      const list = fresh(key, now);
      list.push(now);
      failures.set(key, list);
      if (failures.size > maxKeys) failures.delete(failures.keys().next().value as string);
    },
    clear(key: string): void {
      failures.delete(key);
    },
  };
}

const MESSAGES: Record<string, string> = {
  JOIN_CODE_INVALID: "الكود غير صحيح أو متوقف",
  JOIN_TOO_MANY_ATTEMPTS: "محاولات كتير. استنى شوية وجرّب تاني",
  JOIN_QUEUE_FULL: "فيه طلبات كتير مستنية موافقة المدير دلوقتي. جرّب بعدين",
  JOIN_USERNAME_TAKEN: "اسم المستخدم ده مستخدم. اختار اسم تاني",
  JOIN_FAILED: "تعذر إرسال الطلب. جرّب تاني",
};

/** Arabic text for an error thrown by the join functions (anything unknown gets the generic one). */
export function joinErrorMessage(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error ?? "");
  return MESSAGES[text] ?? (/[\u0600-\u06FF]/.test(text) && text.length < 160 ? text : MESSAGES.JOIN_FAILED);
}
