import assert from "node:assert/strict";
import test from "node:test";
import { decideActivation, decideStatus, type ActivationRecord, type LicenseRecord } from "./license-decision.ts";

const lic: LicenseRecord = { id: "L1", status: "active", maxDevices: 1 };
const act = (id: string, fingerprint: string, releasedAt: string | null = null): ActivationRecord => ({ id, fingerprint, releasedAt });

test("unknown code and revoked code are denied", () => {
  assert.deepEqual(decideActivation(null, [], "fp1"), { action: "deny", error: "LICENSE_INVALID" });
  assert.deepEqual(decideActivation({ ...lic, status: "revoked" }, [], "fp1"), { action: "deny", error: "LICENSE_REVOKED" });
});

test("first device activates; a second device is refused at the limit", () => {
  assert.deepEqual(decideActivation(lic, [], "fp1"), { action: "create" });
  assert.deepEqual(decideActivation(lic, [act("A1", "fp1")], "fp2"), { action: "deny", error: "LICENSE_DEVICE_LIMIT" });
});

test("the same machine re-activates (reinstall) without using another slot", () => {
  assert.deepEqual(decideActivation(lic, [act("A1", "fp1")], "fp1"), { action: "reuse", activationId: "A1" });
});

test("a released device frees its slot for a new machine", () => {
  assert.deepEqual(decideActivation(lic, [act("A1", "fp1", "2026-10-01")], "fp2"), { action: "create" });
});

test("more devices allowed when the license says so", () => {
  const two = { ...lic, maxDevices: 2 };
  assert.deepEqual(decideActivation(two, [act("A1", "fp1")], "fp2"), { action: "create" });
  assert.deepEqual(decideActivation(two, [act("A1", "fp1"), act("A2", "fp2")], "fp3"), { action: "deny", error: "LICENSE_DEVICE_LIMIT" });
});

test("status told to a device that phones home", () => {
  assert.equal(decideStatus(lic, act("A1", "fp1")), "active");
  assert.equal(decideStatus({ ...lic, status: "revoked" }, act("A1", "fp1")), "revoked");
  assert.equal(decideStatus(null, act("A1", "fp1")), "revoked");
  assert.equal(decideStatus(lic, act("A1", "fp1", "2026-10-01")), "released");
  assert.equal(decideStatus(lic, null), "released");
});
