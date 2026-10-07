import { createServerFn } from "@tanstack/react-start";
import { getSql, type Sql } from "@/lib/db";
import { createAttemptLimiter } from "@/lib/join-requests";
import { verifyLicense } from "@/lib/license-code";
import { LICENSE_PUBLIC_KEY } from "@/lib/license-public-key";
import { logEvent } from "@/lib/logger.server";

/**
 * Offline activation for the local program. The code is checked against the public key inside the program
 * (see license-code.ts): no server of yours is involved and nothing leaves the customer's computer.
 * Required only when a public key is configured, and only to create the FIRST admin; an installation that
 * already has one keeps working untouched.
 */

export const licenseRequired = () => LICENSE_PUBLIC_KEY.length > 0;

async function activatedId(sql: Sql): Promise<string | null> {
  const rows = await sql<{ value: string }>`select value from platform_settings where key = 'license_id' limit 1`;
  return rows[0]?.value ? rows[0].value : null;
}

/** Throws LICENSE_REQUIRED when activation is needed and has not happened. */
export async function assertLicensed(sql: Sql): Promise<void> {
  if (licenseRequired() && !(await activatedId(sql))) throw new Error("LICENSE_REQUIRED");
}

export const getLicenseStatus = createServerFn({ method: "GET" }).handler(async (): Promise<{ required: boolean; activated: boolean }> => {
  if (!licenseRequired()) return { required: false, activated: true };
  return { required: true, activated: Boolean(await activatedId(await getSql())) };
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
  if (!licenseRequired()) return { ok: true };
  const sql = await getSql();
  // Once the first admin exists the program is already set up; nothing to activate.
  const admin = await sql<{ exists: boolean }>`select exists(select 1 from platform_admins) as exists`;
  if (admin[0]?.exists) return { ok: true };

  const key = await clientKey();
  if (failures.isBlocked(key)) throw new Error("LICENSE_TOO_MANY_ATTEMPTS");
  const result = verifyLicense(data?.code, LICENSE_PUBLIC_KEY);
  if (!result.ok) {
    failures.recordFailure(key);
    throw new Error("LICENSE_INVALID");
  }
  await sql.query(
    `insert into platform_settings (key, value) values ('license_id', $1), ('license_activated_at', $2)
     on conflict (key) do update set value = excluded.value, updated_at = current_timestamp`,
    [result.id, new Date().toISOString()],
  );
  logEvent("info", "license.activated", { licenseId: result.id });
  return { ok: true };
});

export function licenseErrorMessage(error: unknown): string {
  const text = error instanceof Error ? error.message : "";
  if (/LICENSE_TOO_MANY_ATTEMPTS/.test(text)) return "محاولات كتير غلط. جرّب بعد شوية";
  if (/LICENSE_REQUIRED/.test(text)) return "لازم تفعّل البرنامج الأول بكود التفعيل";
  if (/LICENSE_INVALID/.test(text)) return "كود التفعيل غير صحيح. اتأكد إنك نسخته كامل";
  return "تعذر التفعيل. جرّب تاني";
}
