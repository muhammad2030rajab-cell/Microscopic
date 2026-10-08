import { DEVICE_STATUSES, parseDateOnly, parseQuantity, type DeviceStatus } from "./inventory-math.ts";

/** Validation of what the device and supply forms send. Pure; every message is shown to the user as is. */

function text(value: unknown, max: number, label: string): string | null {
  const v = typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
  if (!v) return null;
  if (v.length > max) throw new Error(`${label} أطول من ${max} حرف`);
  return v;
}

function requiredName(value: unknown): string {
  const name = text(value, 120, "الاسم");
  if (!name || name.length < 2) throw new Error("الاسم قصير جدًا");
  return name;
}

function optionalDate(value: unknown, label: string): string | null {
  if (value === null || value === undefined || (typeof value === "string" && !value.trim())) return null;
  const date = parseDateOnly(value);
  if (!date) throw new Error(`${label}: تاريخ غير صحيح`);
  return date;
}

export type DeviceInput = {
  name: string;
  model: string | null;
  serialNo: string | null;
  location: string | null;
  status: DeviceStatus;
  purchaseDate: string | null;
  warrantyUntil: string | null;
  lastServiceDate: string | null;
  nextServiceDate: string | null;
  notes: string | null;
};

export function cleanDeviceInput(data: Record<string, unknown>): DeviceInput {
  const status = (data.status ?? "working") as DeviceStatus;
  if (!DEVICE_STATUSES.includes(status)) throw new Error("حالة الجهاز غير صحيحة");
  const lastServiceDate = optionalDate(data.lastServiceDate, "آخر صيانة");
  const nextServiceDate = optionalDate(data.nextServiceDate, "الصيانة القادمة");
  if (lastServiceDate && nextServiceDate && nextServiceDate < lastServiceDate) throw new Error("الصيانة القادمة قبل آخر صيانة");
  return {
    name: requiredName(data.name),
    model: text(data.model, 120, "الموديل"),
    serialNo: text(data.serialNo, 80, "الرقم التسلسلي"),
    location: text(data.location, 120, "المكان"),
    status,
    purchaseDate: optionalDate(data.purchaseDate, "تاريخ الشراء"),
    warrantyUntil: optionalDate(data.warrantyUntil, "نهاية الضمان"),
    lastServiceDate,
    nextServiceDate,
    notes: text(data.notes, 500, "الملاحظات"),
  };
}

export type SupplyInput = {
  name: string;
  unit: string | null;
  quantity: number;
  minQuantity: number;
  expiryDate: string | null;
  lotNo: string | null;
  supplier: string | null;
  notes: string | null;
};

function quantity(value: unknown, label: string): number {
  if (value === null || value === undefined || (typeof value === "string" && !value.trim())) return 0;
  const n = parseQuantity(value);
  if (n === null) throw new Error(`${label}: رقم غير صحيح`);
  return n;
}

export function cleanSupplyInput(data: Record<string, unknown>): SupplyInput {
  return {
    name: requiredName(data.name),
    unit: text(data.unit, 30, "الوحدة"),
    quantity: quantity(data.quantity, "الكمية"),
    minQuantity: quantity(data.minQuantity, "الحد الأدنى"),
    expiryDate: optionalDate(data.expiryDate, "تاريخ الانتهاء"),
    lotNo: text(data.lotNo, 60, "رقم التشغيلة"),
    supplier: text(data.supplier, 120, "المورّد"),
    notes: text(data.notes, 500, "الملاحظات"),
  };
}

export type MoveInput = { kind: "in" | "out"; amount: number; note: string | null };

/**
 * A stock movement typed by the user: received ("in") or used ("out"), amount above zero.
 * "adjust" movements are never typed: they are written automatically when someone edits the quantity itself.
 */
export function cleanMoveInput(data: Record<string, unknown>): MoveInput {
  const kind = data.kind;
  if (kind !== "in" && kind !== "out") throw new Error("نوع الحركة غير صحيح");
  const amount = parseQuantity(data.amount);
  if (amount === null || amount <= 0) throw new Error("الكمية لازم تكون أكبر من صفر");
  return { kind, amount, note: text(data.note, 200, "الملاحظة") };
}
