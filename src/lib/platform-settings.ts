import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { toWhatsAppNumber } from "@/lib/phone";

export const DEFAULT_SUPPORT_WHATSAPP = "201120660398";
export const ANNOUNCEMENT_MAX_LENGTH = 280;

export type PublicPlatformSettings = {
  supportWhatsapp: string;
  announcement: string;
};

export type PlatformSettingsAdminView = PublicPlatformSettings & {
  /** YYYY-MM-DD (Cairo time, inclusive) or "" for no expiry. */
  announcementExpiresAt: string;
  /** True when an expiry date is set and has passed (the banner is hidden). */
  announcementExpired: boolean;
  updatedAt: string | null;
};

const LAB_TIME_ZONE = "Africa/Cairo";
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Today's date in Cairo as YYYY-MM-DD. */
function todayCairo(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: LAB_TIME_ZONE });
}

function isRealDate(value: string): boolean {
  if (!DATE_RE.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

const DEFAULTS: PublicPlatformSettings = {
  supportWhatsapp: DEFAULT_SUPPORT_WHATSAPP,
  announcement: "",
};

async function readSettings(): Promise<{
  values: PublicPlatformSettings;
  rawAnnouncement: string;
  expiresAt: string;
  expired: boolean;
  updatedAt: string | null;
}> {
  const sql = await getSql();
  const rows = await sql<{ key: string; value: string; updated_at: string | Date }>`
    select key, value, updated_at from platform_settings
    where key in ('support_whatsapp', 'announcement', 'announcement_expires_at')
  `;
  const map = new Map(rows.map((r) => [r.key, r.value]));
  const latest = rows.map((r) => String(r.updated_at)).sort().pop() ?? null;
  const rawAnnouncement = map.get("announcement")?.trim() || "";
  const expiresAt = map.get("announcement_expires_at")?.trim() || "";
  const expired = isRealDate(expiresAt) && todayCairo() > expiresAt;
  return {
    values: {
      supportWhatsapp: map.get("support_whatsapp")?.trim() || DEFAULTS.supportWhatsapp,
      // Expired announcements are hidden from everyone.
      announcement: expired ? "" : rawAnnouncement,
    },
    rawAnnouncement,
    expiresAt,
    expired,
    updatedAt: latest,
  };
}

/**
 * Public (no sign-in): used by the login page and lab dashboards. Exposes only
 * the support WhatsApp number and the announcement text. Never throws — the
 * login page must still work if the table is missing or the DB hiccups.
 */
export const getPublicPlatformSettings = createServerFn({ method: "GET" }).handler(
  async (): Promise<PublicPlatformSettings> => {
    try {
      return (await readSettings()).values;
    } catch {
      return DEFAULTS;
    }
  },
);

async function requireSuperAdmin(userId: string) {
  const sql = await getSql();
  const rows = await sql<{ is_super: boolean }>`
    select is_super from platform_admins
    where auth_user_id = ${userId} and is_active = true
    limit 1
  `;
  if (!rows.length || rows[0].is_super !== true) throw new Error("SUPER_ADMIN_REQUIRED");
  return sql;
}

function toAdminView(r: Awaited<ReturnType<typeof readSettings>>): PlatformSettingsAdminView {
  return {
    supportWhatsapp: r.values.supportWhatsapp,
    announcement: r.rawAnnouncement,
    announcementExpiresAt: r.expiresAt,
    announcementExpired: r.expired,
    updatedAt: r.updatedAt,
  };
}

export const getPlatformSettingsAdmin = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<PlatformSettingsAdminView> => {
    await requireSuperAdmin(context.userId);
    return toAdminView(await readSettings());
  });

export const updatePlatformSettings = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(
    async ({
      context,
      data,
    }: {
      context: { userId: string };
      data: { supportWhatsapp: string; announcement: string; announcementExpiresAt?: string };
    }): Promise<PlatformSettingsAdminView> => {
      const sql = await requireSuperAdmin(context.userId);

      const supportWhatsapp = toWhatsAppNumber(data.supportWhatsapp);
      if (!supportWhatsapp) throw new Error("رقم الواتساب غير صالح");

      const announcement = (data.announcement ?? "").trim();
      if (announcement.length > ANNOUNCEMENT_MAX_LENGTH) {
        throw new Error(`الإعلان أطول من ${ANNOUNCEMENT_MAX_LENGTH} حرف`);
      }

      const expiresAt = (data.announcementExpiresAt ?? "").trim();
      if (expiresAt) {
        if (!isRealDate(expiresAt)) throw new Error("تاريخ الانتهاء غير صالح");
        if (expiresAt < todayCairo()) throw new Error("تاريخ الانتهاء في الماضي");
      }

      for (const [key, value] of [
        ["support_whatsapp", supportWhatsapp],
        ["announcement", announcement],
        // An expiry without an announcement is meaningless: clear it together.
        ["announcement_expires_at", announcement ? expiresAt : ""],
      ] as const) {
        await sql.query(
          `insert into platform_settings (key, value, updated_by) values ($1,$2,$3)
           on conflict (key) do update
             set value = excluded.value, updated_at = current_timestamp, updated_by = excluded.updated_by`,
          [key, value, context.userId],
        );
      }

      await logAudit(sql, {
        actorAuthUserId: context.userId,
        action: "platform.settings_update",
        entityType: "platform_settings",
      });

      return toAdminView(await readSettings());
    },
  );
