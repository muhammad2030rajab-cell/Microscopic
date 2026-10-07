import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getPlatformAdminContext } from "@/lib/platform-admin.server";
import { createSerial } from "@/lib/license-serials.server";

/** Admin screens for registration numbers (cloud deployment, super admin only). */

export type LicenseSerialSummary = {
  id: string;
  last4: string;
  note: string;
  status: "unused" | "active" | "disabled";
  machine: string | null;
  activatedAt: string | null;
  createdAt: string;
};

async function superSql(userId: string) {
  const ctx = await getPlatformAdminContext(userId);
  if (!ctx.isSuper) throw new Error("FORBIDDEN");
  return ctx.sql;
}

export const listLicenseSerials = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<LicenseSerialSummary[]> => {
    const sql = await superSql(context.userId);
    const rows = await sql<{ id: string; last4: string; note: string; machine: string | null; activated_at: string | null; disabled_at: string | null; created_at: string }>`
      select id, last4, note, machine, activated_at, disabled_at, created_at from license_serials order by created_at desc limit 500
    `;
    return rows.map((r) => ({
      id: r.id,
      last4: r.last4,
      note: r.note,
      status: r.disabled_at ? "disabled" : r.machine ? "active" : "unused",
      machine: r.machine ? r.machine.match(/.{4}/g)!.join("-") : null,
      activatedAt: r.activated_at,
      createdAt: r.created_at,
    }));
  });

/** Returns the number ONCE: only its hash is stored, so write it down / send it now. */
export const createLicenseSerial = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context, data }: { context: { userId: string }; data: { note: string } }): Promise<{ id: string; serial: string }> => {
    const sql = await superSql(context.userId);
    return createSerial(sql, typeof data?.note === "string" ? data.note : "", context.userId);
  });

/** The customer changed computers: free the number so it can be activated on the new one (the old code stays in their hands). */
export const resetLicenseSerial = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context, data }: { context: { userId: string }; data: { id: string } }): Promise<{ ok: true }> => {
    const sql = await superSql(context.userId);
    await sql.query(`update license_serials set machine = null, license_code = null, activated_at = null where id = $1 and disabled_at is null`, [data.id]);
    return { ok: true };
  });

/** Stops an UNUSED number from ever being activated (a sale that fell through). */
export const disableLicenseSerial = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context, data }: { context: { userId: string }; data: { id: string } }): Promise<{ ok: true }> => {
    const sql = await superSql(context.userId);
    await sql.query(`update license_serials set disabled_at = current_timestamp where id = $1 and machine is null`, [data.id]);
    return { ok: true };
  });
