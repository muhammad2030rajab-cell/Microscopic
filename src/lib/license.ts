import { createServerFn } from "@tanstack/react-start";
import { createAttemptLimiter } from "@/lib/join-requests";

/** Public server functions for the setup page; the logic lives in license-runtime.server.ts. */

export const getLicenseStatus = createServerFn({ method: "GET" }).handler(async (): Promise<{ required: boolean; activated: boolean }> => {
  const { currentLicenseState } = await import("@/lib/license-runtime.server");
  const s = await currentLicenseState();
  return { required: s.required, activated: s.activated };
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
  const { activateOnline, licenseRequired } = await import("@/lib/license-runtime.server");
  if (!licenseRequired()) return { ok: true };
  const { getSql } = await import("@/lib/db");
  const sql = await getSql();
  // Once the first admin exists the program is already set up; nothing to activate.
  const admin = await sql<{ exists: boolean }>`select exists(select 1 from platform_admins) as exists`;
  if (admin[0]?.exists) return { ok: true };
  const key = await clientKey();
  if (failures.isBlocked(key)) throw new Error("LICENSE_TOO_MANY_ATTEMPTS");
  try {
    await activateOnline(String(data?.code ?? "").trim());
  } catch (error) {
    if (error instanceof Error && /LICENSE_(INVALID|REVOKED|DEVICE_LIMIT)/.test(error.message)) failures.recordFailure(key);
    throw error;
  }
  return { ok: true };
});
