import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { hostname, networkInterfaces } from "node:os";
import { promisify } from "node:util";

const run = promisify(execFile);

async function rawMachineId(): Promise<string> {
  try {
    if (process.platform === "win32") {
      const { stdout } = await run("reg", ["query", "HKLM\\SOFTWARE\\Microsoft\\Cryptography", "/v", "MachineGuid"], { windowsHide: true, timeout: 5000 });
      const id = /MachineGuid\s+REG_SZ\s+(\S+)/i.exec(stdout)?.[1];
      if (id) return id;
    } else if (process.platform === "darwin") {
      const { stdout } = await run("ioreg", ["-rd1", "-c", "IOPlatformExpertDevice"], { timeout: 5000 });
      const id = /"IOPlatformUUID"\s*=\s*"([^"]+)"/.exec(stdout)?.[1];
      if (id) return id;
    } else {
      for (const file of ["/etc/machine-id", "/var/lib/dbus/machine-id"]) {
        const id = (await readFile(file, "utf8").catch(() => "")).trim();
        if (id) return id;
      }
    }
  } catch {
    /* fall through to the weaker identifier */
  }
  let mac = "";
  for (const list of Object.values(networkInterfaces())) {
    for (const item of list ?? []) {
      if (!mac && !item.internal && item.mac && item.mac !== "00:00:00:00:00:00") mac = item.mac;
    }
  }
  return `${hostname()}|${mac}`;
}

let cached: string | null = null;

/** A stable id for THIS computer (hashed; the raw id never leaves the machine). */
export async function getMachineFingerprint(): Promise<string> {
  if (!cached) cached = createHash("sha256").update(`rjb-machine:${await rawMachineId()}`).digest("hex");
  return cached;
}

export const getDeviceName = () => hostname().slice(0, 80);
