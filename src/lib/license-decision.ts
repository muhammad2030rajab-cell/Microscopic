/** The activation rules, as pure functions (the API route only does the database work around them). */

export type LicenseRecord = { id: string; status: "active" | "revoked"; maxDevices: number };
export type ActivationRecord = { id: string; fingerprint: string; releasedAt: string | Date | null };

export type ActivationDecision =
  | { action: "deny"; error: "LICENSE_INVALID" | "LICENSE_REVOKED" | "LICENSE_DEVICE_LIMIT" }
  | { action: "reuse"; activationId: string }
  | { action: "create" };

/** A code activates on at most `maxDevices` machines; the same machine can re-activate (reinstall) freely. */
export function decideActivation(license: LicenseRecord | null, activations: ActivationRecord[], fingerprint: string): ActivationDecision {
  if (!license) return { action: "deny", error: "LICENSE_INVALID" };
  if (license.status === "revoked") return { action: "deny", error: "LICENSE_REVOKED" };
  const live = activations.filter((a) => !a.releasedAt);
  const same = live.find((a) => a.fingerprint === fingerprint);
  if (same) return { action: "reuse", activationId: same.id };
  if (live.length >= license.maxDevices) return { action: "deny", error: "LICENSE_DEVICE_LIMIT" };
  return { action: "create" };
}

export type LicenseStatus = "active" | "revoked" | "released";

/** What a device that phones home is told. "released" = you freed this device's slot (e.g. he moved to a new PC). */
export function decideStatus(license: LicenseRecord | null, activation: ActivationRecord | null): LicenseStatus {
  if (!license || license.status === "revoked") return "revoked";
  if (!activation || activation.releasedAt) return "released";
  return "active";
}
