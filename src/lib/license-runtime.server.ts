import { getSql, type Sql } from "@/lib/db";
import { LICENSE_ENFORCED, LICENSE_PUBLIC_KEY, LICENSE_SERVER_URL } from "@/lib/license-config";
import { verifyLicenseToken } from "@/lib/license-token";
import { getDeviceName, getMachineFingerprint } from "@/lib/machine-fingerprint.server";
import { logEvent } from "@/lib/logger.server";

/**
 * The customer-side half of activation. Needed only in a build that carries your public key, and never on the
 * deployment that holds the private key (that one IS the license server). The first activation needs internet;
 * after that the program checks its stored token on this machine, offline. When it happens to be online it asks
 * the license server (at most twice a day, in the background) whether the license was revoked, and only an
 * explicit "revoked" or "released" answer locks the program. No internet never locks anything.
 */

export const licenseRequired = () => LICENSE_ENFORCED && LICENSE_PUBLIC_KEY.length > 0 && !process.env.LICENSE_PRIVATE_KEY;

const MESSAGES = {
  NOT_ACTIVATED: "البرنامج غير مفعّل. اكتب كود التفعيل أولًا",
  WRONG_DEVICE: "الترخيص ده متفعّل على جهاز تاني. تواصل مع المطوّر لنقله",
  REVOKED: "تم إيقاف ترخيص البرنامج. تواصل مع المطوّر",
} as const;
export type LockReason = keyof typeof MESSAGES;

async function setting(sql: Sql, key: string): Promise<string> {
  const rows = await sql<{ value: string }>`select value from platform_settings where key = ${key} limit 1`;
  return rows[0]?.value ?? "";
}

async function saveSetting(sql: Sql, key: string, value: string) {
  await sql.query(
    `insert into platform_settings (key, value) values ($1, $2) on conflict (key) do update set value = excluded.value, updated_at = current_timestamp`,
    [key, value],
  );
}

export type LicenseState = { required: boolean; activated: boolean; reason?: LockReason };

let cache: { at: number; state: LicenseState } | null = null;
let lastPing = 0;
const CACHE_MS = 60_000;
const PING_EVERY_MS = 12 * 3_600_000;

export function resetLicenseCache() {
  cache = null;
}

export async function currentLicenseState(): Promise<LicenseState> {
  if (!licenseRequired()) return { required: false, activated: true };
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.state;
  const sql = await getSql();
  const token = await setting(sql, "license_token");
  let state: LicenseState;
  const payload = verifyLicenseToken(token, LICENSE_PUBLIC_KEY);
  if (!payload) state = { required: true, activated: false, reason: "NOT_ACTIVATED" };
  else if (payload.fp !== (await getMachineFingerprint())) state = { required: true, activated: false, reason: "WRONG_DEVICE" };
  else if ((await setting(sql, "license_revoked")) === "1") state = { required: true, activated: false, reason: "REVOKED" };
  else state = { required: true, activated: true };
  cache = { at: Date.now(), state };
  if (payload && state.activated) void pingLicenseServer(token);
  return state;
}

/** Throws an Arabic message when the program may not be used. Cheap: cached for a minute. */
export async function assertLicensedRuntime(): Promise<void> {
  const state = await currentLicenseState();
  if (!state.activated) throw new Error(MESSAGES[state.reason ?? "NOT_ACTIVATED"]);
}

/** Best effort and silent: any failure (offline, timeout, server down) changes nothing. */
async function pingLicenseServer(token: string): Promise<void> {
  if (!LICENSE_SERVER_URL || Date.now() - lastPing < PING_EVERY_MS) return;
  lastPing = Date.now();
  try {
    const res = await fetch(`${LICENSE_SERVER_URL.replace(/\/+$/, "")}/api/license`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "status", token }),
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return;
    const { status } = (await res.json()) as { status?: string };
    const sql = await getSql();
    if (status === "revoked" || status === "released") {
      await saveSetting(sql, "license_revoked", "1");
      resetLicenseCache();
      logEvent("warn", "license.locked_by_server", { status });
    } else if (status === "active" && (await setting(sql, "license_revoked")) === "1") {
      await saveSetting(sql, "license_revoked", "");
      resetLicenseCache();
    }
  } catch {
    /* offline is fine */
  }
}

export type ActivateError = "LICENSE_INVALID" | "LICENSE_REVOKED" | "LICENSE_DEVICE_LIMIT" | "LICENSE_TOO_MANY_ATTEMPTS" | "LICENSE_OFFLINE" | "LICENSE_SERVER_NOT_SET" | "LICENSE_BAD_REPLY";

/** First activation: asks the license server, checks its signed answer, keeps the token on this machine. */
export async function activateOnline(code: string): Promise<void> {
  if (!LICENSE_SERVER_URL) throw new Error("LICENSE_SERVER_NOT_SET");
  const fingerprint = await getMachineFingerprint();
  let res: Response;
  try {
    res = await fetch(`${LICENSE_SERVER_URL.replace(/\/+$/, "")}/api/license`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "activate", code, fingerprint, deviceName: getDeviceName() }),
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    throw new Error("LICENSE_OFFLINE");
  }
  const body = (await res.json().catch(() => ({}))) as { token?: string; error?: string };
  if (!res.ok || !body.token) throw new Error(body.error && /^LICENSE_/.test(body.error) ? body.error : "LICENSE_BAD_REPLY");
  const payload = verifyLicenseToken(body.token, LICENSE_PUBLIC_KEY);
  if (!payload || payload.fp !== fingerprint) throw new Error("LICENSE_BAD_REPLY");
  const sql = await getSql();
  await saveSetting(sql, "license_token", body.token);
  await saveSetting(sql, "license_revoked", "");
  await saveSetting(sql, "license_activated_at", new Date().toISOString());
  resetLicenseCache();
  logEvent("info", "license.activated", { licenseId: payload.lic });
}
