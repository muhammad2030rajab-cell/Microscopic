import { createServerFn } from "@tanstack/react-start";
import { getSql } from "@/lib/db";
import { createAttemptLimiter } from "@/lib/join-requests";
import { formatDeviceId, verifyLicense } from "@/lib/license-code";
import { getDeviceId, isLicensed, licenseRequired, rememberLicensed } from "@/lib/license-check.server";
import { LICENSE_PUBLIC_KEY } from "@/lib/license-public-key";
import { logEvent } from "@/lib/logger.server";

/**
 * Offline activation for the local program. The customer sends the device id shown on this screen; the seller
 * answers with a code made for that computer only. The code is checked against the public key inside the program
 * (see license-code.ts): no server of yours is involved and nothing leaves the customer's computer.
 *
 * This file must contain only createServerFn exports and pure helpers: the server-only checks live in
 * license-check.server.ts and are used inside the handlers below.
 */

export type LicenseStatus = { required: boolean; activated: boolean; deviceId: string };

export const getLicenseStatus = createServerFn({ method: "GET" }).handler(async (): Promise<LicenseStatus> => {
  if (!licenseRequired()) return { required: false, activated: true, deviceId: "" };
  const device = getDeviceId();
  return {
    required: true,
    activated: await isLicensed(await getSql()),
    deviceId: device ? formatDeviceId(device) : "",
  };
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
  const key = await clientKey();
  if (failures.isBlocked(key)) throw new Error("LICENSE_TOO_MANY_ATTEMPTS");
  const device = getDeviceId();
  if (!device) throw new Error("LICENSE_NO_DEVICE");
  const code = typeof data?.code === "string" ? data.code.trim() : "";
  const result = verifyLicense(code, LICENSE_PUBLIC_KEY, device);
  if (!result.ok) {
    failures.recordFailure(key);
    throw new Error(result.reason === "DEVICE" ? "LICENSE_WRONG_DEVICE" : "LICENSE_INVALID");
  }
  const sql = await getSql();
  // The whole code is stored (not just a flag): it is re-verified against this computer on every sign-in.
  await sql.query(
    `insert into platform_settings (key, value) values ('license_code', $1), ('license_id', $2), ('license_activated_at', $3)
     on conflict (key) do update set value = excluded.value, updated_at = current_timestamp`,
    [code, result.id, new Date().toISOString()],
  );
  rememberLicensed();
  logEvent("info", "license.activated", { licenseId: result.id });
  return { ok: true };
});

export function licenseErrorMessage(error: unknown): string {
  const text = error instanceof Error ? error.message : "";
  if (/LICENSE_TOO_MANY_ATTEMPTS/.test(text)) return "محاولات كتير غلط. جرّب بعد شوية";
  if (/LICENSE_REQUIRED/.test(text)) return "لازم تفعّل البرنامج الأول بكود التفعيل";
  if (/LICENSE_WRONG_DEVICE/.test(text)) return "الكود ده متعمل لجهاز تاني. ابعت رقم جهازك للبائع واطلب كود لجهازك";
  if (/LICENSE_NO_DEVICE/.test(text)) return "تعذر قراءة رقم الجهاز. تواصل مع البائع";
  if (/LICENSE_INVALID/.test(text)) return "كود التفعيل غير صحيح. اتأكد إنك نسخته كامل";
  return "تعذر التفعيل. جرّب تاني";
}
