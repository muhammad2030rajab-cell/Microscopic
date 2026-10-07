import assert from "node:assert/strict";
import test from "node:test";
import { inviteErrorMessage, inviteStatus, validateNewInvite, validateNewLab } from "./lab-invite-input.ts";

const now = new Date("2026-10-07T12:00:00Z");
const base = { uses: 0, maxUses: 1, expiresAt: null, revokedAt: null };

test("status: active, used up, expired, revoked (revoked wins)", () => {
  assert.equal(inviteStatus(base, now), "active");
  assert.equal(inviteStatus({ ...base, uses: 1 }, now), "used_up");
  assert.equal(inviteStatus({ ...base, expiresAt: "2026-10-07T11:59:59Z" }, now), "expired");
  assert.equal(inviteStatus({ ...base, expiresAt: "2026-10-08T00:00:00Z" }, now), "active");
  assert.equal(inviteStatus({ ...base, uses: 1, expiresAt: "2026-10-01T00:00:00Z", revokedAt: "2026-10-02T00:00:00Z" }, now), "revoked");
});

test("new invite: defaults and limits", () => {
  assert.deepEqual(validateNewInvite({}), { ok: true, label: "", maxUses: 1, expiresInDays: null });
  assert.deepEqual(validateNewInvite({ label: "  معمل   النور ", maxUses: "5", expiresInDays: "7" }), { ok: true, label: "معمل النور", maxUses: 5, expiresInDays: 7 });
  assert.equal(validateNewInvite({ maxUses: 0 }).ok, false);
  assert.equal(validateNewInvite({ maxUses: 101 }).ok, false);
  assert.equal(validateNewInvite({ maxUses: 1.5 }).ok, false);
  assert.equal(validateNewInvite({ expiresInDays: 0 }).ok, false);
  assert.equal(validateNewInvite({ expiresInDays: 366 }).ok, false);
  assert.equal(validateNewInvite({ label: "x".repeat(61) }).ok, false);
});

test("new lab: names and username", () => {
  assert.deepEqual(validateNewLab({ labName: "  معمل  النور ", ownerName: "", username: " Nour.Lab " }), { ok: true, labName: "معمل النور", ownerName: "", username: "nour.lab" });
  assert.deepEqual(validateNewLab({ labName: "م", ownerName: "", username: "abc" }), { ok: false, error: "LAB_NAME_INVALID" });
  assert.deepEqual(validateNewLab({ labName: "معمل", ownerName: "", username: "a b" }), { ok: false, error: "USERNAME_INVALID" });
  assert.deepEqual(validateNewLab({ labName: "معمل", ownerName: "x".repeat(61), username: "abc" }), { ok: false, error: "OWNER_NAME_TOO_LONG" });
  assert.equal(validateNewLab({ labName: 5, ownerName: null, username: undefined }).ok, false);
});

test("error messages: known codes, Arabic passthrough, unknown fallback", () => {
  assert.match(inviteErrorMessage(new Error("INVITE_CODE_INVALID")), /الكود/);
  assert.equal(inviteErrorMessage(new Error("كلمة المرور ضعيفة")), "كلمة المرور ضعيفة");
  assert.match(inviteErrorMessage(new Error("boom")), /تعذر/);
});
