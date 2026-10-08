import { createServerFn } from "@tanstack/react-start";
import { randomUUID } from "node:crypto";
import { authMiddleware } from "@/lib/auth/middleware";
import { logAudit } from "@/lib/audit";
import { formatJoinCode, generateJoinCode, hashJoinCode } from "@/lib/join-requests";
import { requirePlatformPermission } from "@/lib/platform-admin.server";

/** Admin side of licensing (on your cloud deployment): make codes, see who activated what, revoke, free a device. */

export type LicenseDevice = { id: string; deviceName: string; activatedAt: string; lastSeenAt: string | null; released: boolean };
export type LicenseRow = { id: string; note: string; maxDevices: number; status: "active" | "revoked"; createdAt: string; devices: LicenseDevice[] };

export const createLicense = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context, data }: { context: { userId: string }; data: { note?: string; maxDevices?: number } }): Promise<{ code: string }> => {
    const sql = await requirePlatformPermission(context.userId, "labs.create");
    const note = (data?.note ?? "").replace(/\s+/g, " ").trim().slice(0, 80);
    const maxDevices = Number(data?.maxDevices ?? 1);
    if (!Number.isInteger(maxDevices) || maxDevices < 1 || maxDevices > 20) throw new Error("عدد الأجهزة من 1 إلى 20");
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
