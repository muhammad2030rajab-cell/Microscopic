// Shared (client + server safe): permission types, labels and helpers. No server-only imports here.

/** كل الصلاحيات القابلة للمنح لمدير منصة غير عام (غير Super Admin). */
export type PlatformPermission =
  | "labs.create"
  | "labs.suspend"
  | "labs.delete"
  | "admins.manage";

export type PlatformPermissions = Partial<Record<PlatformPermission, boolean>>;

export const ALL_PLATFORM_PERMISSIONS: PlatformPermission[] = [
  "labs.create", "labs.suspend", "labs.delete", "admins.manage",
];

export const PLATFORM_PERMISSION_LABELS: Record<PlatformPermission, string> = {
  "labs.create": "إضافة معامل جديدة",
  "labs.suspend": "إيقاف/تفعيل المعامل",
  "labs.delete": "حذف المعامل",
  "admins.manage": "إدارة مديري المنصة",
};

export function parsePlatformPermissions(raw: PlatformPermissions | string | null | undefined): PlatformPermissions {
  if (!raw) return {};
  if (typeof raw === "string") {
    try { return JSON.parse(raw) as PlatformPermissions; } catch { return {}; }
  }
  return raw;
}

export function normalizePlatformPermissions(permissions?: PlatformPermissions): PlatformPermissions {
  const result: PlatformPermissions = {};
  for (const permission of ALL_PLATFORM_PERMISSIONS) {
    if (permissions?.[permission] === true) result[permission] = true;
  }
  return result;
}
