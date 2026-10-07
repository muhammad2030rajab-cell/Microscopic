import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { getSql, type Sql } from "@/lib/db";
import { deviceIdFromMachineGuid, verifyLicense } from "@/lib/license-code";
import { LICENSE_PUBLIC_KEY } from "@/lib/license-public-key";

/**
 * Server-only license checks for the local program. Never import this from client code; call it from inside
 * createServerFn handlers, auth hooks and middleware only (that is why it is a `.server.ts` file).
 *
 * Activation is required only in the local program (HUB_MODE=1, never on Vercel) and only when a public key is
 * built in. The activation code is re-verified (signature + this computer's id) on every sign-in and, cached for
 * a few minutes, on every authenticated server call, so copying the data folder to another PC does not work.
 */

export const licenseRequired = (): boolean =>
  LICENSE_PUBLIC_KEY.length > 0 && process.env.HUB_MODE === "1" && !process.env.VERCEL;

function readMachineGuid(): string {
  if (process.platform === "win32") {
    const out = execFileSync("reg", ["query", "HKLM\\SOFTWARE\\Microsoft\\Cryptography", "/v", "MachineGuid"], {
      encoding: "utf8",
      windowsHide: true,
      timeout: 5000,
    });
    const match = /MachineGuid\s+REG_SZ\s+(\S+)/i.exec(out);
    if (match) return match[1];
  } else if (process.platform === "darwin") {
    const out = execFileSync("ioreg", ["-rd1", "-c", "IOPlatformExpertDevice"], { encoding: "utf8", timeout: 5000 });
    const match = /"IOPlatformUUID"\s*=\s*"([^"]+)"/.exec(out);
    if (match) return match[1];
  } else {
    for (const file of ["/etc/machine-id", "/var/lib/dbus/machine-id"]) {
      try {
        const text = readFileSync(file, "utf8").trim();
        if (text) return text;
      } catch {
        /* try the next one */
      }
    }
  }
  throw new Error("machine id not found");
}

let cachedDevice: string | undefined;

/** This computer's id (16 hex chars), or null if the operating system would not tell. Only successes are cached. */
export function getDeviceId(): string | null {
  if (cachedDevice) return cachedDevice;
  try {
    cachedDevice = deviceIdFromMachineGuid(readMachineGuid());
    return cachedDevice;
  } catch {
    return null;
  }
}

const OK_FOR_MS = 5 * 60_000;
let okUntil = 0;

/** Call right after a successful activation so the next request does not re-check. */
export function rememberLicensed(): void {
  okUntil = Date.now() + OK_FOR_MS;
}

export async function isLicensed(sql: Sql): Promise<boolean> {
  if (!licenseRequired()) return true;
  if (Date.now() < okUntil) return true;
  const rows = await sql<{ value: string }>`select value from platform_settings where key = 'license_code' limit 1`;
  const code = rows[0]?.value;
  if (!code) return false;
  const ok = verifyLicense(code, LICENSE_PUBLIC_KEY, getDeviceId()).ok;
  if (ok) rememberLicensed();
  return ok;
}

/** Throws LICENSE_REQUIRED when activation is needed and the stored code is missing, forged or for another PC. */
export async function assertLicensed(sql: Sql): Promise<void> {
  if (!(await isLicensed(sql))) throw new Error("LICENSE_REQUIRED");
}

/** Same, for callers that do not hold a database handle (auth hooks, middleware). */
export async function assertLicensedNow(): Promise<void> {
  if (!licenseRequired()) return;
  await assertLicensed(await getSql());
}
