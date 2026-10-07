import { randomUUID } from "node:crypto";
import type { Sql } from "@/lib/db";
import { issueLicense, parseMachineId } from "@/lib/license-code";
import { decideActivation, hashSerial, normalizeSerial } from "@/lib/license-serial";

type Row = { id: string; machine: string | null; license_code: string | null; disabled_at: string | null };

export type ActivationResult =
  | { ok: true; code: string }
  | { ok: false; error: "SERIAL_INVALID" | "SERIAL_USED" | "BAD_REQUEST" | "NOT_CONFIGURED" };

/** The private key lives ONLY in your cloud deployment's environment (LICENSE_PRIVATE_KEY), never in the program. */
function privateKeyPem(): string | null {
  const raw = process.env.LICENSE_PRIVATE_KEY?.trim();
  if (!raw) return null;
  return raw.replace(/\\n/g, "\n");
}

export async function activateSerial(sql: Sql, serialInput: unknown, machineInput: unknown): Promise<ActivationResult> {
  const serial = normalizeSerial(serialInput);
  const machineBytes = parseMachineId(machineInput);
  if (!serial || !machineBytes) return { ok: false, error: "BAD_REQUEST" };
  const pem = privateKeyPem();
  if (!pem) return { ok: false, error: "NOT_CONFIGURED" };
  const machine = Buffer.from(machineBytes).toString("hex").toUpperCase();
  const hash = hashSerial(serial);

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const rows = await sql.query<Row>(`select id, machine, license_code, disabled_at from license_serials where serial_hash = $1 limit 1`, [hash]);
    const row = rows[0];
    const decision = decideActivation(row ? { machine: row.machine, disabled: row.disabled_at !== null } : null, machine);
    if (decision === "NOT_FOUND") return { ok: false, error: "SERIAL_INVALID" };
    if (decision === "USED_ELSEWHERE") return { ok: false, error: "SERIAL_USED" };
    if (decision === "REISSUE" && row.license_code) return { ok: true, code: row.license_code };
    // BIND: the first computer wins. The update only succeeds while nobody has bound it yet.
    const { code } = issueLicense(pem, machineBytes);
    const bound = await sql.query<{ id: string }>(
      `update license_serials set machine = $2, license_code = $3, activated_at = current_timestamp
       where id = $1 and machine is null and disabled_at is null returning id`,
      [row.id, machine, code],
    );
    if (bound.length) return { ok: true, code };
    // Someone else bound it a moment ago: loop once more to decide again.
  }
  return { ok: false, error: "SERIAL_USED" };
}

export async function createSerial(sql: Sql, note: string, createdBy: string): Promise<{ id: string; serial: string }> {
  const { generateSerial } = await import("@/lib/license-serial");
  const serial = generateSerial();
  const id = randomUUID();
  await sql.query(`insert into license_serials (id, serial_hash, last4, note, created_by) values ($1, $2, $3, $4, $5)`, [
    id, hashSerial(serial), serial.slice(-4), note.trim().slice(0, 120), createdBy,
  ]);
  return { id, serial };
}
