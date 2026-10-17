import { createServerFn } from "@tanstack/react-start";
import { randomUUID } from "node:crypto";
import { decideActivation } from "@/lib/license-decision";
import { parseDeviceId, pemFromEnv, signLicenseToken } from "@/lib/license-token";
import { authMiddleware } from "@/lib/auth/middleware";
import { logAudit } from "@/lib/audit";
import { formatJoinCode, generateJoinCode, hashJoinCode } from "@/lib/join-requests";
import { requirePlatformPermission } from "@/lib/platform-admin.server";

/** Admin side of licensing (on your cloud deployment): make codes, see who activated what, revoke, free a device. */

export type LicenseDevice = { id: string; deviceName: string; activatedAt: string; lastSeenAt: string | null; released: boolean };
export type LicenseRow = { id: string; note: string; maxDevices: number; status: "active" | "revoked"; createdAt: string; devices: LicenseDevice[] };

export const createLicense = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context, data }: { context: { userId: string }; data: { note?: string } }): Promise<{ code: string }> => {
    const sql = await requirePlatformPermission(context.userId, "labs.create");
    const note = (data?.note ?? "").replace(/\s+/g, " ").trim().slice(0, 80);
    const maxDevices = 1; // every code is tied to ONE device (moving to a new PC = "release the device" first)
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const code = generateJoinCode();
      const id = randomUUID();
      try {
        await sql.query(`insert into licenses (id, code_hash, note, max_devices, created_by) values ($1,$2,$3,$4,$5)`, [id, await hashJoinCode(code), note, maxDevices, context.userId]);
      } catch (error) {
        if (/23505|duplicate key/i.test(`${error instanceof Error ? error.message : ""} ${(error as { code?: string }).code ?? ""}`)) continue;
        throw error;
      }
      await logAudit(sql, { labId: null, actorAuthUserId: context.userId, action: "license.create", entityType: "license", entityId: id });
      return { code: formatJoinCode(code) };
    }
    throw new Error("تعذر إنشاء كود جديد. جرّب تاني");
  });

export const listLicenses = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<LicenseRow[]> => {
    const sql = await requirePlatformPermission(context.userId, "labs.create");
    const licenses = await sql<{ id: string; note: string; max_devices: number; status: "active" | "revoked"; created_at: string | Date }>`
      select id, note, max_devices, status, created_at from licenses order by created_at desc limit 200
    `;
    const devices = await sql<{ id: string; license_id: string; device_name: string; activated_at: string | Date; last_seen_at: string | Date | null; released_at: string | Date | null }>`
      select id, license_id, device_name, activated_at, last_seen_at, released_at from license_activations order by activated_at
    `;
    return licenses.map((l) => ({
      id: l.id,
      note: l.note,
      maxDevices: Number(l.max_devices),
      status: l.status,
      createdAt: new Date(l.created_at).toISOString(),
      devices: devices
        .filter((d) => d.license_id === l.id)
        .map((d) => ({ id: d.id, deviceName: d.device_name, activatedAt: new Date(d.activated_at).toISOString(), lastSeenAt: d.last_seen_at ? new Date(d.last_seen_at).toISOString() : null, released: Boolean(d.released_at) })),
    }));
  });

export const setLicenseStatus = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context, data }: { context: { userId: string }; data: { id: string; status: "active" | "revoked" } }) => {
    const sql = await requirePlatformPermission(context.userId, "labs.create");
    if (data.status !== "active" && data.status !== "revoked") throw new Error("حالة غير معروفة");
    await sql.query(`update licenses set status = $2 where id = $1`, [data.id, data.status]);
    await logAudit(sql, { labId: null, actorAuthUserId: context.userId, action: `license.${data.status}`, entityType: "license", entityId: data.id });
    return { ok: true };
  });

/** Frees one device's slot (he moved to a new PC). The old PC locks the next time it is online. */
export const releaseLicenseDevice = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context, data }: { context: { userId: string }; data: { id: string } }) => {
    const sql = await requirePlatformPermission(context.userId, "labs.create");
    await sql.query(`update license_activations set released_at = current_timestamp where id = $1 and released_at is null`, [data.id]);
    await logAudit(sql, { labId: null, actorAuthUserId: context.userId, action: "license.device_released", entityType: "license_activation", entityId: data.id });
    return { ok: true };
  });

/**
 * Issues a long activation key for ONE device straight from the admin page: paste the device id the customer sent,
 * get the key to send back. The customer pastes it on his screen with no internet needed. Unlike a hand-signed
 * OFF- key it belongs to a license in the database, so stopping the license or releasing the device still works.
 */
export const issueLicenseDeviceKey = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context, data }: { context: { userId: string }; data: { id: string; deviceId: string; deviceName?: string } }): Promise<{ key: string }> => {
    const sql = await requirePlatformPermission(context.userId, "labs.create");
    const pem = process.env.LICENSE_PRIVATE_KEY ? pemFromEnv(process.env.LICENSE_PRIVATE_KEY) : "";
    if (!pem) throw new Error("مفتاح التوقيع (LICENSE_PRIVATE_KEY) مش متظبط على النشرة دي");
    const fingerprint = parseDeviceId(String(data?.deviceId ?? ""));
    if (!fingerprint) throw new Error("رقم الجهاز غير صحيح. لازم 64 حرف وأرقام (A-F و0-9) والشرطات والمسافات مسموحة");
    const licenses = await sql<{ id: string; status: "active" | "revoked"; max_devices: number }>`select id, status, max_devices from licenses where id = ${String(data?.id ?? "")} limit 1`;
    const row = licenses[0];
    const activations = row
      ? (await sql<{ id: string; fingerprint: string; released_at: string | Date | null }>`select id, fingerprint, released_at from license_activations where license_id = ${row.id}`).map((a) => ({
          id: a.id,
          fingerprint: a.fingerprint,
          releasedAt: a.released_at ? String(a.released_at) : null,
        }))
      : [];
    const decision = decideActivation(row ? { id: row.id, status: row.status, maxDevices: Number(row.max_devices) } : null, activations, fingerprint);
    if (decision.action === "deny") {
      throw new Error(
        decision.error === "LICENSE_DEVICE_LIMIT"
          ? "الكود ده مربوط بجهاز تاني. حرّر الجهاز القديم الأول (زرار «تحرير الجهاز») وبعدين اربطه بالجديد"
          : decision.error === "LICENSE_REVOKED"
            ? "الترخيص موقوف. أعد تفعيله الأول"
            : "الترخيص غير موجود",
      );
    }
    const deviceName = String(data?.deviceName ?? "").replace(/\s+/g, " ").trim().slice(0, 80) || "جهاز (مفتاح يدوي)";
    if (decision.action === "reuse") {
      await sql.query(`update license_activations set device_name = $2 where id = $1`, [decision.activationId, deviceName]);
    } else {
      const inserted = await sql<{ id: string }>`
        insert into license_activations (id, license_id, fingerprint, device_name, last_seen_at)
        select ${randomUUID()}, ${row!.id}, ${fingerprint}, ${deviceName}, current_timestamp
        where (select count(*) from license_activations where license_id = ${row!.id} and released_at is null) < ${Number(row!.max_devices)}
        returning id
      `;
      if (!inserted.length) throw new Error("الكود ده مربوط بجهاز تاني. حرّر الجهاز القديم الأول");
    }
    await logAudit(sql, { labId: null, actorAuthUserId: context.userId, action: "license.device_key_issued", entityType: "license", entityId: row!.id });
    return { key: signLicenseToken(pem, { lic: row!.id, fp: fingerprint }) };
  });
