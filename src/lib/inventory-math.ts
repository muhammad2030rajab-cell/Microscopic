/**
 * Rules for lab devices and supplies: dates, stock levels, expiry and service alerts, typed quantities.
 * Pure, no imports of its own, unit-tested with plain node (see inventory.test.ts).
 * Dates are plain "YYYY-MM-DD" strings (never JS Date objects), so a time zone can never shift a day.
 */

/** The lab's local time zone: "today" rolls over at local midnight, not UTC midnight. */
export const INVENTORY_TIME_ZONE = "Africa/Cairo";
/** A supply that expires within this many days is flagged "soon". */
export const EXPIRY_WARN_DAYS = 30;
/** A device whose next service is within this many days is flagged "soon". */
export const SERVICE_WARN_DAYS = 14;
export const MAX_QUANTITY = 1_000_000_000;

/** Today's date in Cairo as YYYY-MM-DD. */
export function todayInCairo(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: INVENTORY_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** A strict real calendar date typed as YYYY-MM-DD (Arabic digits are accepted), or null. Empty means "not set". */
export function parseDateOnly(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const ascii = input.trim().replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ascii);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (y < 1990 || y > 2100) return null;
  const date = new Date(Date.UTC(y, mo - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d) return null;
  return ascii;
}

/** Whole days from `from` to `to` (both YYYY-MM-DD); negative when `to` is earlier. */
export function daysBetween(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}

/** A typed quantity ("12", "0.5", "١٢,٥") → a number with at most 2 decimals, or null when invalid. */
export function parseQuantity(input: unknown): number | null {
  if (typeof input === "number") {
    if (!Number.isFinite(input) || input < 0 || input > MAX_QUANTITY) return null;
    return Math.round(input * 100) / 100;
  }
  if (typeof input !== "string") return null;
  const ascii = input
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
    .replace(/[٫,]/g, ".")
    .replace(/\s/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(ascii)) return null;
  const value = Number(ascii);
  return value <= MAX_QUANTITY ? Math.round(value * 100) / 100 : null;
}

/** 12 → "12", 12.5 → "12.5", 12.345 → "12.35". */
export function formatQuantity(n: number): string {
  return Number(n.toFixed(2)).toLocaleString("en-US", { maximumFractionDigits: 2 });
}

export type StockState = "out" | "low" | "ok";

/** out = nothing left; low = at or below the minimum the lab set (only when a minimum is set). */
export function stockState(quantity: number, minQuantity: number): StockState {
  if (quantity <= 0) return "out";
  if (minQuantity > 0 && quantity <= minQuantity) return "low";
  return "ok";
}

export type ExpiryState = "none" | "ok" | "soon" | "expired";

export function expiryState(expiry: string | null, today: string): ExpiryState {
  if (!expiry) return "none";
  const days = daysBetween(today, expiry);
  if (days < 0) return "expired";
  if (days <= EXPIRY_WARN_DAYS) return "soon";
  return "ok";
}

export type ServiceState = "none" | "ok" | "soon" | "overdue";

export function serviceState(nextService: string | null, today: string): ServiceState {
  if (!nextService) return "none";
  const days = daysBetween(today, nextService);
  if (days < 0) return "overdue";
  if (days <= SERVICE_WARN_DAYS) return "soon";
  return "ok";
}

export type WarrantyState = "none" | "active" | "expired";

export function warrantyState(warrantyUntil: string | null, today: string): WarrantyState {
  if (!warrantyUntil) return "none";
  return daysBetween(today, warrantyUntil) < 0 ? "expired" : "active";
}

export type SupplyLike = { quantity: number; minQuantity: number; expiryDate: string | null };
export type DeviceLike = { status: DeviceStatus; nextServiceDate: string | null };

export type InventorySummary = {
  /** Supplies that are out of stock or at/below their minimum. */
  lowOrOut: number;
  /** Supplies expired or expiring soon. */
  expiringOrExpired: number;
  /** Devices whose service is overdue or due soon, or that are not working. */
  devicesNeedingAttention: number;
};

export function summarizeInventory(supplies: SupplyLike[], devices: DeviceLike[], today: string): InventorySummary {
  return {
    lowOrOut: supplies.filter((s) => stockState(s.quantity, s.minQuantity) !== "ok").length,
    expiringOrExpired: supplies.filter((s) => {
      const e = expiryState(s.expiryDate, today);
      return e === "soon" || e === "expired";
    }).length,
    devicesNeedingAttention: devices.filter((d) => {
      const s = serviceState(d.nextServiceDate, today);
      return d.status !== "working" || s === "soon" || s === "overdue";
    }).length,
  };
}

export const DEVICE_STATUSES = ["working", "maintenance", "out_of_service"] as const;
export type DeviceStatus = (typeof DEVICE_STATUSES)[number];
export const DEVICE_STATUS_LABELS: Record<DeviceStatus, string> = {
  working: "شغّال",
  maintenance: "في الصيانة",
  out_of_service: "خارج الخدمة",
};

export const MOVE_KINDS = ["in", "out", "adjust"] as const;
export type MoveKind = (typeof MOVE_KINDS)[number];
export const MOVE_KIND_LABELS: Record<MoveKind, string> = { in: "وارد", out: "منصرف", adjust: "تسوية" };

/** Balance after a received ("in") or used ("out") amount; null when it would go below zero (stock can never be negative). */
export function applyMove(quantity: number, kind: "in" | "out", amount: number): number | null {
  const delta = kind === "out" ? -amount : amount;
  const next = Math.round((quantity + delta) * 100) / 100;
  return next < 0 ? null : next;
}
