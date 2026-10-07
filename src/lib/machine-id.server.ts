/**
 * This computer's identifier (no network, no extra packages).
 * Windows: the motherboard's own id (SMBIOS UUID), which SURVIVES reinstalling Windows, so the same
 * registration number activates again on the same computer. Only if the board reports a useless placeholder id
 * (some cheap boards do) it falls back to the MachineGuid Windows creates at install time; that one changes on a
 * reinstall, and then you free the number with "نقل لجهاز جديد".
 * Pure node imports only, so the seller's license tool can run it too.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const PLACEHOLDER_UUIDS = new Set([
  "00000000-0000-0000-0000-000000000000",
  "ffffffff-ffff-ffff-ffff-ffffffffffff",
  "03000200-0400-0500-0006-000700080009",
  "12345678-1234-5678-90ab-cddeefaabbcc",
  "11111111-2222-3333-4444-555555555555",
  "01234567-89ab-cdef-0123-456789abcdef",
]);

/** A real, per-board SMBIOS UUID (not empty, not all one digit, not a known factory placeholder). */
export function isUsableSmbiosUuid(value: string): boolean {
  const v = value.trim().toLowerCase();
  if (!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(v)) return false;
  if (PLACEHOLDER_UUIDS.has(v)) return false;
  return new Set(v.replace(/-/g, "")).size > 2;
}

function windowsSmbiosUuid(): string | null {
  const attempts: [string, string[]][] = [
    ["powershell", ["-NoProfile", "-NonInteractive", "-Command", "(Get-CimInstance Win32_ComputerSystemProduct).UUID"]],
    ["wmic", ["csproduct", "get", "uuid"]],
  ];
  for (const [cmd, args] of attempts) {
    try {
      const out = execFileSync(cmd, args, { encoding: "utf8", windowsHide: true, timeout: 20000 });
      const match = /[0-9a-fA-F]{8}(-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}/.exec(out);
      if (match && isUsableSmbiosUuid(match[0])) return match[0].toLowerCase();
    } catch {
      /* try the next one */
    }
  }
  return null;
}

let cached: string | null = null;

export function readRawMachineId(): string {
  if (cached) return cached;
  cached = readRawMachineIdUncached();
  return cached;
}

function readRawMachineIdUncached(): string {
  try {
    if (process.platform === "win32") {
      const board = windowsSmbiosUuid();
      if (board) return `smbios:${board}`;
      const out = execFileSync("reg", ["query", "HKLM\\SOFTWARE\\Microsoft\\Cryptography", "/v", "MachineGuid"], {
        encoding: "utf8",
        windowsHide: true,
        timeout: 8000,
      });
      const match = /MachineGuid\s+REG_SZ\s+(\S+)/i.exec(out);
      if (match) return `guid:${match[1]}`;
    } else if (process.platform === "darwin") {
      const out = execFileSync("ioreg", ["-rd1", "-c", "IOPlatformExpertDevice"], { encoding: "utf8", timeout: 8000 });
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
  } catch {
    /* fall through */
  }
  throw new Error("MACHINE_ID_UNAVAILABLE");
}
