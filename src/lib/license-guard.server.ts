import { getSql } from "@/lib/db";
import { machineBytesFromRaw, formatMachineId, verifyLicense } from "@/lib/license-code";
import { LICENSE_PUBLIC_KEY } from "@/lib/license-public-key";
import { readRawMachineId } from "@/lib/machine-id.server";

/** This computer's id in the form the customer reads out: XXXX-XXXX-XXXX-XXXX. */
export function thisMachine(): { bytes: Uint8Array; text: string } {
  const bytes = machineBytesFromRaw(readRawMachineId());
  return { bytes, text: formatMachineId(bytes) };
}

let confirmed = false;

/**
 * The program runs only on the computer its code was issued for. The signed code is kept in the database and
 * re-checked here against this computer, so copying the data folder (or the whole program) to another PC does
 * not carry the activation, and editing the database cannot fake one (it needs the seller's signature).
 * Only the local program (HUB_MODE) ever needs activation: the cloud deployment shares this code and is never gated.
 */
export async function assertLicensedHere(): Promise<void> {
  if (!LICENSE_PUBLIC_KEY || process.env.HUB_MODE !== "1" || confirmed) return;
  const sql = await getSql();
  const rows = await sql<{ value: string }>`select value from platform_settings where key = 'license_code' limit 1`;
  const code = rows[0]?.value;
  if (!code) throw new Error("LICENSE_REQUIRED");
  const result = verifyLicense(code, LICENSE_PUBLIC_KEY, thisMachine().bytes);
  if (!result.ok) throw new Error(result.reason === "MACHINE" ? "LICENSE_WRONG_PC" : "LICENSE_REQUIRED");
  confirmed = true;
}
