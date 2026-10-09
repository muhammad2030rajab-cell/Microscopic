import { createServerFn } from "@tanstack/react-start";
import { createAttemptLimiter } from "@/lib/join-requests";

/** Public server functions for the setup page; the logic lives in license-runtime.server.ts. */

export const getLicenseStatus = createServerFn({ method: "GET" }).handler(async (): Promise<{ required: boolean; activated: boolean; deviceId?: string }> => {
  const { currentDeviceId, currentLicenseState } = await import("@/lib/license-runtime.server");
  const s = await currentLicenseState();
  // The device id is only needed on the activation screen.
  return { required: s.required, activated: s.activated, deviceId: s.required && !s.activated ? await currentDeviceId() : undefined };
});

// Wrong codes: 8 per visitor per 15 minutes.
const failures = createAttemptLimiter({ max: 8, windowMs: 15 * 60_000 });

async function clientKey(): Promise<string> {
  try {
    const mod = (await import("@tanstack/react-start/server")) as Record<string, unknown>;
    const header = mod.getRequestHeader as ((name: string) => string | undefined) | undefined;
    return (header?.("x-forwarded-for") ?? header?.("x-real-ip") ?? "").split(",")[0].trim() || "unknown";
  } catch {
    return "unknown";
  }
}

export const activateLicense = createServerFn({ method: "POST" }).handler(async ({ data }: { data: { code: string } }): Promise<{ ok: true }> => {
  const { activateOffline, activateOnline, currentLicenseState } = await import("@/lib/license-runtime.server");
  const { looksLikeSignedKey } = await import("@/lib/license-token");
  // Nothing to do when activation is off or the program is already active. When it is locked (first run, or a new
  // computer / Windows after setup) a valid key is all it takes: a key only works for this machine anyway.
  if ((await currentLicenseState()).activated) return { ok: true };
  const key = await clientKey();
  if (failures.isBlocked(key)) throw new Error("LICENSE_TOO_MANY_ATTEMPTS");
  try {
    const code = String(data?.code ?? "").trim();
    // A long signed key works with no internet at all; the short code goes through the license server.
    if (looksLikeSignedKey(code)) await activateOffline(code);
    else await activateOnline(code);
  } catch (error) {
    if (error instanceof Error && /LICENSE_(INVALID|WRONG_DEVICE|REVOKED|DEVICE_LIMIT)/.test(error.message)) failures.recordFailure(key);
    throw error;
  }
  return { ok: true };
});
