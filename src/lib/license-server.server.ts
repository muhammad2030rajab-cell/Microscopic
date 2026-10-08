import { randomUUID } from "node:crypto";
import { getSql } from "@/lib/db";
import { createAttemptLimiter, hashJoinCode, normalizeJoinCode } from "@/lib/join-requests";
import { decideActivation, decideStatus, type ActivationRecord } from "@/lib/license-decision";
import { pemFromEnv, publicBase64FromPrivatePem, signLicenseToken, verifyLicenseToken } from "@/lib/license-token";
import { logEvent } from "@/lib/logger.server";

/**
 * The license server: the endpoint (/api/license) that customers' programs call, on YOUR cloud deployment.
 * It only ever sees a license code, an anonymous machine hash and a device name; never customer data.
 * It signs tokens with LICENSE_PRIVATE_KEY (an environment variable on that deployment only).
 */

const failures = createAttemptLimiter({ max: 8, windowMs: 15 * 60_000 });
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "cache-control": "no-store" } });
const ERROR_STATUS = { LICENSE_INVALID: 404, LICENSE_REVOKED: 403, LICENSE_DEVICE_LIMIT: 409 } as const;

type LicenseRow = { id: string; status: "active" | "revoked"; max_devices: number };
type ActivationRow = { id: string; fingerprint: string; released_at: string | Date | null };
const asRecord = (r: LicenseRow | undefined) => (r ? { id: r.id, status: r.status, maxDevices: Number(r.max_devices) } : null);
const asActivation = (a: ActivationRow): ActivationRecord => ({ id: a.id, fingerprint: a.fingerprint, releasedAt: a.released_at ? String(a.released_at) : null });

export async function handleLicenseRequest(request: Request): Promise<Response> {
  const pem = process.env.LICENSE_PRIVATE_KEY ? pemFromEnv(process.env.LICENSE_PRIVATE_KEY) : "";
  if (!pem) return json({ error: "LICENSE_SERVER_NOT_CONFIGURED" }, 503);

  let body: Record<string, unknown>;
  try {
    const text = await request.text();
    if (text.length > 4000) return json({ error: "LICENSE_BAD_REQUEST" }, 400);
    body = JSON.parse(text) as Record<string, unknown>;
  } catch {
    return json({ error: "LICENSE_BAD_REQUEST" }, 400);
  }
  const sql = await getSql();

  if (body.action === "activate") {
    const key = (request.headers.get("x-forwarded-for") ?? request.headers.get("x-real-ip") ?? "").split(",")[0].trim() || "unknown";
    if (failures.isBlocked(key)) return json({ error: "LICENSE_TOO_MANY_ATTEMPTS" }, 429);
    const fingerprint = typeof body.fingerprint === "string" && /^[a-f0-9]{64}$/.test(body.fingerprint) ? body.fingerprint : "";
    const deviceName = typeof body.deviceName === "string" ? body.deviceName.slice(0, 80) : "";
    const code = normalizeJoinCode(body.code);
    if (!fingerprint || !code) {
      failures.recordFailure(key);
      return json({ error: "LICENSE_INVALID" }, 404);
    }
    const licenses = await sql<LicenseRow>`select id, status, max_devices from licenses where code_hash = ${await hashJoinCode(code)} limit 1`;
    const license = asRecord(licenses[0]);
    const activations = license ? (await sql<ActivationRow>`select id, fingerprint, released_at from license_activations where license_id = ${license.id}`).map(asActivation) : [];
    const decision = decideActivation(license, activations, fingerprint);
    if (decision.action === "deny") {
      if (decision.error === "LICENSE_INVALID") failures.recordFailure(key);
      logEvent("warn", "license.activation_denied", { error: decision.error, licenseId: license?.id });
      return json({ error: decision.error }, ERROR_STATUS[decision.error]);
    }
    if (decision.action === "reuse") {
      await sql.query(`update license_activations set last_seen_at = current_timestamp, device_name = $2 where id = $1`, [decision.activationId, deviceName]);
    } else {
      // One statement checks the device limit again, so two machines racing for the last slot cannot both get it.
      const inserted = await sql<{ id: string }>`
        insert into license_activations (id, license_id, fingerprint, device_name, last_seen_at)
        select ${randomUUID()}, ${license!.id}, ${fingerprint}, ${deviceName}, current_timestamp
        where (select count(*) from license_activations where license_id = ${license!.id} and released_at is null) < ${license!.maxDevices}
        returning id
      `;
      if (!inserted.length) return json({ error: "LICENSE_DEVICE_LIMIT" }, 409);
      logEvent("info", "license.activated", { licenseId: license!.id, device: deviceName });
    }
    return json({ token: signLicenseToken(pem, { lic: license!.id, fp: fingerprint }) });
  }

  if (body.action === "status") {
    const payload = verifyLicenseToken(body.token, publicBase64FromPrivatePem(pem));
    if (!payload) return json({ error: "LICENSE_BAD_TOKEN" }, 400); // never lock a device because of an unreadable token
    const licenses = await sql<LicenseRow>`select id, status, max_devices from licenses where id = ${payload.lic} limit 1`;
    const rows = await sql<ActivationRow>`
      select id, fingerprint, released_at from license_activations where license_id = ${payload.lic} and fingerprint = ${payload.fp} order by activated_at desc limit 1
    `;
    const activation = rows[0] ? asActivation(rows[0]) : null;
    if (activation) await sql.query(`update license_activations set last_seen_at = current_timestamp where id = $1`, [activation.id]);
    return json({ status: decideStatus(asRecord(licenses[0]), activation) });
  }

  return json({ error: "LICENSE_BAD_REQUEST" }, 400);
}
