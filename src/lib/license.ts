import { createServerFn } from "@tanstack/react-start";
import { getSql, type Sql } from "@/lib/db";
import { createAttemptLimiter } from "@/lib/join-requests";
import { verifyLicense } from "@/lib/license-code";
import { assertLicensedHere, thisMachine } from "@/lib/license-guard.server";
import { normalizeSerial } from "@/lib/license-serial";
import { LICENSE_PUBLIC_KEY, LICENSE_SERVER_URL } from "@/lib/license-public-key";
import { logEvent } from "@/lib/logger.server";

/**
 * Offline activation for the local program. The code is bound to one computer and is checked against the public key
 * inside the program (see license-code.ts): no server of yours is involved and nothing leaves the customer's computer.
 * Required only when a public key is configured, and only to create the FIRST admin; an installation that
 * already has one keeps working untouched.
 */

// Only the local program (HUB_MODE) is gated; the cloud deployment shares this code and never asks for activation.
export const licenseRequired = () => LICENSE_PUBLIC_KEY.length > 0 && process.env.HUB_MODE === "1";

/** Throws LICENSE_REQUIRED / LICENSE_WRONG_PC when activation is needed and is missing or belongs to another PC. */
export async function assertLicensed(sql: Sql): Promise<void> {
  void sql;
  await assertLicensedHere();
}

export const getLicenseStatus = createServerFn({ method: "GET" }).handler(async (): Promise<{ required: boolean; activated: boolean; machineId: string }> => {
  if (!licenseRequired()) return { required: false, activated: true, machineId: "" };
  let machineId = "";
  try {
    machineId = thisMachine().text;
  } catch {
    /* shown as empty; the page tells the customer to contact the seller */
  }
  const activated = await assertLicensedHere().then(() => true, () => false);
  return { required: true, activated, machineId };
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

async function fetchCodeForSerial(serial: string, machine: string): Promise<string> {
  if (!LICENSE_SERVER_URL) throw new Error("LICENSE_SERVER_UNREACHABLE");
  let response: Response;
  try {
    response = await fetch(`${LICENSE_SERVER_URL.replace(/\/+$/, "")}/api/license/activate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ serial, machine }),
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    throw new Error("LICENSE_SERVER_UNREACHABLE");
  }
  if (response.status === 404) throw new Error("LICENSE_SERIAL_INVALID");
  if (response.status === 409) throw new Error("LICENSE_SERIAL_USED");
  if (response.status === 429) throw new Error("LICENSE_TOO_MANY_ATTEMPTS");
  if (!response.ok) throw new Error("LICENSE_SERVER_UNREACHABLE");
  const body = (await response.json().catch(() => null)) as { code?: unknown } | null;
  if (typeof body?.code !== "string") throw new Error("LICENSE_SERVER_UNREACHABLE");
  return body.code;
}

export const activateLicense = createServerFn({ method: "POST" }).handler(async ({ data }: { data: { code: string } }): Promise<{ ok: true }> => {
  if (!licenseRequired()) return { ok: true };
  const sql = await getSql();
  // Once the first admin exists the program is already set up; nothing to activate.
  const admin = await sql<{ exists: boolean }>`select exists(select 1 from platform_admins) as exists`;
  if (admin[0]?.exists) return { ok: true };

  const key = await clientKey();
  if (failures.isBlocked(key)) throw new Error("LICENSE_TOO_MANY_ATTEMPTS");
  let code = typeof data?.code === "string" ? data.code.trim() : "";
  // A short registration number: ask your cloud site once (internet needed this one time) for the code of THIS computer.
  const serial = normalizeSerial(code);
  if (serial) {
    try {
      code = await fetchCodeForSerial(serial, thisMachine().text);
    } catch (error) {
      if (error instanceof Error && /^LICENSE_/.test(error.message) && error.message !== "LICENSE_SERVER_UNREACHABLE") failures.recordFailure(key);
      throw error;
    }
  }
  const result = verifyLicense(code, LICENSE_PUBLIC_KEY, thisMachine().bytes);
  if (!result.ok) {
    failures.recordFailure(key);
    throw new Error(result.reason === "MACHINE" ? "LICENSE_WRONG_PC" : "LICENSE_INVALID");
  }
  await sql.query(
    `insert into platform_settings (key, value) values ('license_id', $1), ('license_code', $2), ('license_activated_at', $3)
     on conflict (key) do update set value = excluded.value, updated_at = current_timestamp`,
    [result.id, code, new Date().toISOString()],
  );
  logEvent("info", "license.activated", { licenseId: result.id });
  return { ok: true };
});

export function licenseErrorMessage(error: unknown): string {
  const text = error instanceof Error ? error.message : "";
  if (/LICENSE_TOO_MANY_ATTEMPTS/.test(text)) return "محاولات كتير غلط. جرّب بعد شوية";
  if (/LICENSE_SERIAL_USED/.test(text)) return "رقم التسجيل ده اتستخدم على جهاز تاني. لو غيّرت جهازك اتواصل مع البائع";
  if (/LICENSE_SERIAL_INVALID/.test(text)) return "رقم التسجيل غير صحيح. اتأكد إنك كتبته كامل";
  if (/LICENSE_SERVER_UNREACHABLE/.test(text)) return "تعذر الاتصال بالإنترنت للتفعيل. اتأكد من النت وجرّب تاني، أو ابعت رقم الجهاز للبائع ياخد منه كود";
  if (/LICENSE_WRONG_PC/.test(text)) return "كود التفعيل ده مش بتاع الجهاز ده. البرنامج مرتبط بجهاز واحد. اتواصل مع البائع وابعتله رقم الجهاز";
  if (/LICENSE_REQUIRED/.test(text)) return "لازم تفعّل البرنامج الأول بكود التفعيل";
  if (/LICENSE_INVALID/.test(text)) return "كود التفعيل غير صحيح. اتأكد إنك نسخته كامل";
  return "تعذر التفعيل. جرّب تاني";
}
