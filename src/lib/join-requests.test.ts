import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createAttemptLimiter, formatJoinCode, generateJoinCode, hashJoinCode, joinErrorMessage, JOIN_CODE_ALPHABET, JOIN_CODE_LENGTH,
  isJoinRole, normalizeJoinCode, presetPermissions, validateJoinRequest,
} from "./join-requests.ts";

test("generateJoinCode: right length, only alphabet characters, different each time", () => {
  const seen = new Set<string>();
  for (let i = 0; i < 200; i++) {
    const code = generateJoinCode();
    assert.equal(code.length, JOIN_CODE_LENGTH);
    for (const ch of code) assert.ok(JOIN_CODE_ALPHABET.includes(ch), code);
    seen.add(code);
  }
  assert.equal(seen.size, 200);
});

test("generateJoinCode: skips random bytes that would favour some letters", () => {
  // 248..255 would be biased (256 is not a multiple of 31): they must be thrown away, never used.
  const feed = [...Array(30).fill(255), ...Array(30).fill(0)];
  let i = 0;
  const code = generateJoinCode((n) => Uint8Array.from({ length: n }, () => feed[i++ % feed.length]));
  assert.equal(code, "A".repeat(JOIN_CODE_LENGTH));
});

test("normalizeJoinCode: forgives case, spaces, dashes and Arabic digits; refuses the rest", () => {
  assert.equal(normalizeJoinCode("abcde-fghjk"), "ABCDEFGHJK");
  assert.equal(normalizeJoinCode(" ab cde fgh jk "), "ABCDEFGHJK");
  assert.equal(normalizeJoinCode("ABCDE-٢٣٤٥٦"), "ABCDE23456");
  assert.equal(normalizeJoinCode("ABCDE-FGHJ"), null); // too short
  assert.equal(normalizeJoinCode("ABCDE-FGHJKM"), null); // too long
  assert.equal(normalizeJoinCode("ABCDE-FGHJ0"), null); // 0 is not in the alphabet
  assert.equal(normalizeJoinCode(undefined), null);
  assert.equal(normalizeJoinCode(123), null);
});

test("formatJoinCode: groups of five", () => {
  assert.equal(formatJoinCode("ABCDEFGHJK"), "ABCDE-FGHJK");
  assert.equal(formatJoinCode("ABC"), "ABC");
});

test("hashJoinCode: stable, 64 hex characters, differs per code", async () => {
  const a = await hashJoinCode("ABCDEFGHJK");
  assert.match(a, /^[0-9a-f]{64}$/);
  assert.equal(a, await hashJoinCode("ABCDEFGHJK"));
  assert.notEqual(a, await hashJoinCode("ABCDEFGHJM"));
});

test("validateJoinRequest: username rule, optional name, password policy", () => {
  assert.deepEqual(validateJoinRequest({ username: " Ahmed.Ali ", name: "  أحمد   علي ", password: "abc12345678" }), { ok: true, username: "ahmed.ali", name: "أحمد علي" });
  assert.deepEqual(validateJoinRequest({ username: "sara", name: "", password: "abc12345678" }), { ok: true, username: "sara", name: "sara" });
  assert.equal(validateJoinRequest({ username: "ab", name: "x", password: "abc12345678" }).ok, false);
  assert.equal(validateJoinRequest({ username: "سارة", name: "x", password: "abc12345678" }).ok, false);
  assert.equal(validateJoinRequest({ username: "sara", name: "x".repeat(61), password: "abc12345678" }).ok, false);
  assert.equal(validateJoinRequest({ username: "sara", name: "x", password: "short1" }).ok, false);
  assert.equal(validateJoinRequest({ username: "sara", name: "x", password: "onlyletterslong" }).ok, false);
  assert.equal(validateJoinRequest({ username: "sara", name: "x", password: undefined }).ok, false);
});

test("attempt limiter: blocks after max failures, frees after the window, keys are independent", () => {
  const limiter = createAttemptLimiter({ max: 3, windowMs: 1000 });
  assert.equal(limiter.isBlocked("a", 0), false);
  limiter.recordFailure("a", 0);
  limiter.recordFailure("a", 100);
  assert.equal(limiter.isBlocked("a", 200), false);
  limiter.recordFailure("a", 300);
  assert.equal(limiter.isBlocked("a", 400), true);
  assert.equal(limiter.isBlocked("b", 400), false);
  assert.equal(limiter.isBlocked("a", 1050), false); // the first failure aged out
  limiter.recordFailure("a", 1060);
  assert.equal(limiter.isBlocked("a", 1070), true);
  limiter.clear("a");
  assert.equal(limiter.isBlocked("a", 1080), false);
});

test("attempt limiter: remembers at most maxKeys visitors", () => {
  const limiter = createAttemptLimiter({ max: 1, windowMs: 10_000, maxKeys: 3 });
  for (const k of ["a", "b", "c", "d"]) limiter.recordFailure(k, 0);
  assert.equal(limiter.isBlocked("a", 1), false); // oldest was dropped
  assert.equal(limiter.isBlocked("d", 1), true);
});

test("joinErrorMessage: known codes, Arabic text passes through, anything else is generic", () => {
  assert.match(joinErrorMessage(new Error("JOIN_CODE_INVALID")), /الكود غير صحيح/);
  assert.match(joinErrorMessage(new Error("وصل المعمل للحد الأقصى")), /وصل المعمل/);
  assert.match(joinErrorMessage(new Error("ECONNRESET")), /تعذر إرسال/);
  assert.match(joinErrorMessage(undefined), /تعذر إرسال/);
});

test("presetPermissions: each role gets a sensible set, nobody gets user management or delete", () => {
  assert.deepEqual(Object.keys(presetPermissions("viewer")).sort(), ["patients.view", "reports.print", "reports.view"]);
  assert.ok(presetPermissions("reviewer")["reports.approve"]);
  assert.equal(presetPermissions("viewer")["reports.create"], undefined);
  assert.ok(presetPermissions("technician")["reports.create"]);
  assert.equal(presetPermissions("technician")["reports.approve"], undefined);
  assert.ok(presetPermissions("supervisor")["reports.approve"]);
  for (const role of ["viewer", "reviewer", "technician", "supervisor", "owner", "junk"]) {
    const p = presetPermissions(role);
    assert.equal(p["users.manage"], undefined, role);
    assert.equal(p["reports.delete"], undefined, role);
    assert.equal(p["patients.delete"], undefined, role);
  }
  assert.deepEqual(presetPermissions("junk"), presetPermissions("viewer"));
});

test("isJoinRole: only the four roles a manager can give", () => {
  for (const r of ["viewer", "reviewer", "technician", "supervisor"]) assert.equal(isJoinRole(r), true);
  for (const r of ["owner", "admin", "", undefined, 5]) assert.equal(isJoinRole(r), false);
});
