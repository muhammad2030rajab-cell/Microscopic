/**
 * Money rules for invoices. Everything is computed in integer piastres (1/100 pound) so sums never drift
 * (0.1 + 0.2). Pure, no imports, unit-tested with plain node.
 */

export const MAX_MONEY = 10_000_000;
export const PAYMENT_METHODS = ["cash", "card", "transfer", "other"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];
export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = { cash: "نقدي", card: "كارت", transfer: "تحويل", other: "أخرى" };

/** Parses a typed amount ("120", "120.5", "١٢٠,٥٠") into piastres, or null when it is not a valid non-negative amount. */
export function parseMoney(input: unknown): number | null {
  if (typeof input === "number") return Number.isFinite(input) && input >= 0 && input <= MAX_MONEY ? Math.round(input * 100) : null;
  if (typeof input !== "string") return null;
  const ascii = input
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
    .replace(/[٫,]/g, ".")
    .replace(/\s/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(ascii)) return null;
  const value = Number(ascii);
  return value <= MAX_MONEY ? Math.round(value * 100) : null;
}

export const toPiastres = (value: number | string | null | undefined): number => Math.round(Number(value ?? 0) * 100) || 0;

/** "1,250.50 ج.م" (whole amounts drop the decimals). */
export function formatMoney(piastres: number): string {
  const whole = piastres % 100 === 0;
  return `${(piastres / 100).toLocaleString("en-US", { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: 2 })} ج.م`;
}

export type InvoiceStatus = "unpriced" | "unpaid" | "partial" | "paid";

export type Invoice = {
  subtotal: number;
  discount: number;
  total: number;
  paid: number;
  remaining: number;
  /** Payments above the total (a refund is owed). */
  overpaid: number;
  status: InvoiceStatus;
};

/** subtotal and discount in piastres; payments is the list of payment amounts in piastres. */
export function computeInvoice(subtotal: number, discount: number, payments: number[]): Invoice {
  const sub = Math.max(0, Math.round(subtotal));
  const disc = Math.min(Math.max(0, Math.round(discount)), sub);
  const total = sub - disc;
  const paid = payments.reduce((n, p) => n + Math.max(0, Math.round(p)), 0);
  const remaining = Math.max(0, total - paid);
  const overpaid = Math.max(0, paid - total);
  const status: InvoiceStatus = sub === 0 ? "unpriced" : paid === 0 ? "unpaid" : remaining > 0 ? "partial" : "paid";
  return { subtotal: sub, discount: disc, total, paid, remaining, overpaid, status };
}

export type PaymentCheck = { ok: true; amount: number } | { ok: false; error: string };

/** A new payment: positive, and not more than what is still owed. */
export function checkPayment(input: unknown, remaining: number): PaymentCheck {
  const amount = parseMoney(input);
  if (amount === null || amount <= 0) return { ok: false, error: "اكتب مبلغًا صحيحًا أكبر من صفر" };
  if (amount > remaining) return { ok: false, error: `المبلغ أكبر من المتبقي (${formatMoney(remaining)})` };
  return { ok: true, amount };
}
