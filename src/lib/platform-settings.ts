import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { toWhatsAppNumber } from "@/lib/phone";
import { LAB_FEATURE_KEYS } from "@/lib/lab-features";
import { PLAN_KEYS, todayCairo as planToday } from "@/lib/lab-plans";

export const DEFAULT_SUPPORT_WHATSAPP = "201120660398";
export const ANNOUNCEMENT_MAX_LENGTH = 280;
export const SUPPORT_TEXT_MAX_LENGTH = 200;

export type PublicPlatformSettings = {
  supportWhatsapp: string;
  announcement: string;
  /** Optional contact details shown on the login page. "" = not set. */
  supportEmail: string;
  websiteUrl: string;
  supportText: string;
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
  supportEmail: "",
  websiteUrl: "",
  supportText: "",
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Only plain http(s) links are accepted (no javascript:, data:, etc.). */
function normalizeWebsite(raw: string): string | null {
  const v = raw.trim();
  if (!v) return "";
  const withScheme = /^https?:\/\//i.test(v) ? v : `https://${v}`;
  try {
    const u = new URL(withScheme);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    if (!u.hostname.includes(".")) return null;
    return u.toString();
  } catch {
    return null;
  }
}

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
    where key in ('support_whatsapp', 'announcement', 'announcement_expires_at',
                  'support_email', 'website_url', 'support_text')
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
      supportEmail: map.get("support_email")?.trim() || "",
      websiteUrl: map.get("website_url")?.trim() || "",
      supportText: map.get("support_text")?.trim() || "",
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
    supportEmail: r.values.supportEmail,
    websiteUrl: r.values.websiteUrl,
    supportText: r.values.supportText,
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
      data: {
        supportWhatsapp: string;
        announcement: string;
        announcementExpiresAt?: string;
        supportEmail?: string;
        websiteUrl?: string;
        supportText?: string;
      };
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

      const supportEmail = (data.supportEmail ?? "").trim();
      if (supportEmail && !EMAIL_RE.test(supportEmail)) throw new Error("البريد الإلكتروني غير صالح");

      const websiteUrl = normalizeWebsite(data.websiteUrl ?? "");
      if (websiteUrl === null) throw new Error("رابط الموقع غير صالح (لازم يبدأ بـ https://)");

      const supportText = (data.supportText ?? "").trim();
      if (supportText.length > SUPPORT_TEXT_MAX_LENGTH) {
        throw new Error(`نص الدعم أطول من ${SUPPORT_TEXT_MAX_LENGTH} حرف`);
      }

      for (const [key, value] of [
        ["support_whatsapp", supportWhatsapp],
        ["support_email", supportEmail],
        ["website_url", websiteUrl],
        ["support_text", supportText],
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

// ---------------------------------------------------------------------------
// Labs overview (statistics + feature switches) — super admin only
// ---------------------------------------------------------------------------

export type LabOverviewRow = {
  id: string;
  name: string;
  isActive: boolean;
  reports: number;
  reportsLast30Days: number;
  patients: number;
  users: number;
  lastReportAt: string | null;
  disabledFeatures: string[];
};

export type LabsOverview = {
  labs: LabOverviewRow[];
  totals: { labs: number; activeLabs: number; reports: number; patients: number; users: number };
};

export const getLabsOverview = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<LabsOverview> => {
    const sql = await requireSuperAdmin(context.userId);
    const rows = await sql<{
      id: string;
      name: string;
      is_active: boolean;
      disabled_features: string[] | null;
      reports: number;
      reports_30d: number;
      patients: number;
      users: number;
      last_report_at: string | Date | null;
    }>`
      select l.id, l.name, l.is_active, l.disabled_features,
             (select count(*)::int from reports r where r.lab_id = l.id) as reports,
             (select count(*)::int from reports r
                where r.lab_id = l.id and r.created_at >= current_timestamp - interval '30 days') as reports_30d,
             (select count(*)::int from patients p where p.lab_id = l.id) as patients,
             (select count(*)::int from lab_users u where u.lab_id = l.id and u.is_active = true) as users,
             (select max(r.created_at) from reports r where r.lab_id = l.id) as last_report_at
      from labs l
      order by l.created_at desc
    `;
    const labs: LabOverviewRow[] = rows.map((r) => ({
      id: r.id,
      name: r.name,
      isActive: r.is_active,
      reports: Number(r.reports),
      reportsLast30Days: Number(r.reports_30d),
      patients: Number(r.patients),
      users: Number(r.users),
      lastReportAt: r.last_report_at ? String(r.last_report_at) : null,
      disabledFeatures: r.disabled_features ?? [],
    }));
    return {
      labs,
      totals: {
        labs: labs.length,
        activeLabs: labs.filter((l) => l.isActive).length,
        reports: labs.reduce((n, l) => n + l.reports, 0),
        patients: labs.reduce((n, l) => n + l.patients, 0),
        users: labs.reduce((n, l) => n + l.users, 0),
      },
    };
  });

export const setLabFeature = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(
    async ({
      context,
      data,
    }: {
      context: { userId: string };
      data: { labId: string; feature: string; enabled: boolean };
    }): Promise<{ disabledFeatures: string[] }> => {
      const sql = await requireSuperAdmin(context.userId);
      if (!LAB_FEATURE_KEYS.includes(data.feature)) throw new Error("ميزة غير معروفة");

      // Single atomic statement: drop the key, then re-add it only when disabling.
      const rows = await sql<{ disabled_features: string[] }>`
        update labs
        set disabled_features = case
              when ${data.enabled} then array_remove(disabled_features, ${data.feature})
              else array_append(array_remove(disabled_features, ${data.feature}), ${data.feature})
            end,
            updated_at = current_timestamp
        where id = ${data.labId}
        returning disabled_features
      `;
      if (!rows.length) throw new Error("LAB_NOT_FOUND");

      await logAudit(sql, {
        labId: data.labId,
        actorAuthUserId: context.userId,
        action: data.enabled ? "lab.feature_enabled" : "lab.feature_disabled",
        entityType: "lab",
        entityId: data.labId,
      });
      return { disabledFeatures: rows[0].disabled_features ?? [] };
    },
  );

// ---------------------------------------------------------------------------
// Plans & subscriptions — super admin only
// ---------------------------------------------------------------------------

export type LabPlanInput = {
  labId: string;
  planName: string | null;
  /** null = unlimited */
  maxUsers: number | null;
  maxReportsPerMonth: number | null;
  /** YYYY-MM-DD or null = no expiry */
  subscriptionEndsAt: string | null;
};

function parseLimit(value: unknown, label: string): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1 || n > 1_000_000) throw new Error(`${label}: اكتب رقم صحيح من 1 لـ 1,000,000 أو سيبه فاضي لو بلا حد`);
  return n;
}

export const updateLabPlan = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context, data }: { context: { userId: string }; data: LabPlanInput }) => {
    const sql = await requireSuperAdmin(context.userId);

    const planName = data.planName?.trim() || null;
    if (planName && !PLAN_KEYS.includes(planName)) throw new Error("باقة غير معروفة");
    const maxUsers = parseLimit(data.maxUsers, "حد المستخدمين");
    const maxReports = parseLimit(data.maxReportsPerMonth, "حد التقارير الشهرية");

    const ends = data.subscriptionEndsAt?.trim() || null;
    if (ends) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(ends) || Number.isNaN(Date.parse(`${ends}T00:00:00Z`))) {
        throw new Error("تاريخ انتهاء الاشتراك غير صالح");
      }
    }

    const rows = await sql<{ id: string }>`
      update labs
      set plan_name = ${planName}, max_users = ${maxUsers}, max_reports_per_month = ${maxReports},
          subscription_ends_at = ${ends}, updated_at = current_timestamp
      where id = ${data.labId}
      returning id
    `;
    if (!rows.length) throw new Error("LAB_NOT_FOUND");

    await logAudit(sql, {
      labId: data.labId,
      actorAuthUserId: context.userId,
      action: "lab.plan_updated",
      entityType: "lab",
      entityId: data.labId,
    });
    return { planName, maxUsers, maxReportsPerMonth: maxReports, subscriptionEndsAt: ends, today: planToday() };
  });
