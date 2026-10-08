import { createServerFn } from "@tanstack/react-start";
import { randomUUID } from "node:crypto";
import { authMiddleware } from "@/lib/auth/middleware";
import { logAudit } from "@/lib/audit";
import { requireLabPermission } from "@/lib/lab-users";
import { PAYMENT_METHODS, checkPayment, computeInvoice, parseMoney, toPiastres, type Invoice, type PaymentMethod } from "@/lib/billing-math";
import type { Sql } from "@/lib/db";

/**
 * Prices, invoices and payments. Everything needs the "billing.manage" permission (the owner has it implicitly),
 * so lab technicians never see money. Branch-bound staff only see their own branch's invoices.
 */

type Ctx = Awaited<ReturnType<typeof requireLabPermission>>;
const billingContext = (userId: string): Promise<Ctx> => requireLabPermission(userId, "billing.manage");

/** Sum (piastres) of the prices of these tests; unpriced tests count 0. Used when a report is saved (a snapshot). */
export async function sumTestPrices(sql: Sql, labId: string, tests: { categoryId: string; name: string }[]): Promise<number> {
  if (!tests.length) return 0;
  const rows = await sql<{ category_id: string; test_name: string; price: string | null }>`
    select category_id, test_name, price from lab_test_catalog where lab_id = ${labId} and price is not null
  `;
  const prices = new Map(rows.map((r) => [`${r.category_id}:${r.test_name}`, toPiastres(r.price)]));
  return tests.reduce((sum, t) => sum + (prices.get(`${t.categoryId}:${t.name}`) ?? 0), 0);
}

// ───────────────────────── prices ─────────────────────────

export type PriceRow = { id: string; testName: string; categoryId: string; categoryAr: string; categoryEn: string; price: number | null };

export const listTestPrices = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<PriceRow[]> => {
    const { sql, labId } = await billingContext(context.userId);
    const rows = await sql<{ id: string; test_name: string; category_id: string; category_name_ar: string; category_name_en: string; price: string | null }>`
      select id, test_name, category_id, category_name_ar, category_name_en, price
      from lab_test_catalog where lab_id = ${labId} and is_active = true order by category_name_en, test_name
    `;
    return rows.map((r) => ({ id: r.id, testName: r.test_name, categoryId: r.category_id, categoryAr: r.category_name_ar, categoryEn: r.category_name_en, price: r.price === null ? null : toPiastres(r.price) }));
  });

/** Sets prices. price: pounds as typed ("120.5") or null/"" to clear. Only changed rows need to be sent. */
export const setTestPrices = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context, data }: { context: { userId: string }; data: { items: { id: string; price: string | number | null }[] } }) => {
    const { sql, labId, labUserId } = await billingContext(context.userId);
    const items = Array.isArray(data?.items) ? data.items.slice(0, 1000) : [];
    for (const item of items) {
      const cleared = item.price === null || item.price === "";
      const piastres = cleared ? null : parseMoney(item.price);
      if (!cleared && piastres === null) throw new Error("سعر غير صحيح");
      await sql.query(`update lab_test_catalog set price = $1, updated_at = now() where id = $2 and lab_id = $3`, [piastres === null ? null : piastres / 100, item.id, labId]);
    }
    await logAudit(sql, { labId, actorUserId: labUserId, actorAuthUserId: context.userId, action: "billing.prices_updated", entityType: "lab", entityId: labId });
    return { updated: items.length };
  });

// ───────────────────────── invoices ─────────────────────────

export type PaymentRow = { id: string; amount: number; method: PaymentMethod; note: string | null; createdAt: string };
export type ReportInvoice = Invoice & { reportId: string; payments: PaymentRow[] };

async function loadInvoice(sql: Sql, labId: string, branchId: string | null, reportId: string): Promise<ReportInvoice | null> {
  const reports = await sql<{ id: string; total_price: string; discount: string }>`
    select id, total_price, discount from reports where id = ${reportId} and lab_id = ${labId} and (${branchId}::text is null or branch_id = ${branchId}) limit 1
  `;
  if (!reports.length) return null;
  const payments = await sql<{ id: string; amount: string; method: PaymentMethod; note: string | null; created_at: string | Date }>`
    select id, amount, method, note, created_at from report_payments where report_id = ${reportId} and lab_id = ${labId} order by created_at
  `;
  const list = payments.map((p) => ({ id: p.id, amount: toPiastres(p.amount), method: p.method, note: p.note, createdAt: new Date(p.created_at).toISOString() }));
  return { reportId, ...computeInvoice(toPiastres(reports[0].total_price), toPiastres(reports[0].discount), list.map((p) => p.amount)), payments: list };
}

export const getReportInvoice = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context, data }: { context: { userId: string }; data: { reportId: string } }): Promise<ReportInvoice | null> => {
    const { sql, labId, branchId } = await billingContext(context.userId);
    return loadInvoice(sql, labId, branchId, data.reportId);
  });

export const setReportDiscount = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context, data }: { context: { userId: string }; data: { reportId: string; discount: string | number } }): Promise<ReportInvoice> => {
    const { sql, labId, labUserId, branchId } = await billingContext(context.userId);
    const piastres = parseMoney(data.discount === "" ? "0" : data.discount);
    if (piastres === null) throw new Error("خصم غير صحيح");
    const current = await loadInvoice(sql, labId, branchId, data.reportId);
    if (!current) throw new Error("التقرير غير موجود");
    if (piastres > current.subtotal) throw new Error("الخصم أكبر من إجمالي الفاتورة");
    if (current.subtotal - piastres < current.paid) throw new Error("المدفوع أكبر من الإجمالي بعد الخصم. احذف دفعة أو قلّل الخصم");
    await sql.query(`update reports set discount = $1 where id = $2 and lab_id = $3`, [piastres / 100, data.reportId, labId]);
    await logAudit(sql, { labId, actorUserId: labUserId, actorAuthUserId: context.userId, action: "billing.discount_set", entityType: "report", entityId: data.reportId });
    return (await loadInvoice(sql, labId, branchId, data.reportId))!;
  });

export const addReportPayment = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context, data }: { context: { userId: string }; data: { reportId: string; amount: string | number; method?: PaymentMethod; note?: string } }): Promise<ReportInvoice> => {
    const { sql, labId, labUserId, branchId } = await billingContext(context.userId);
    const current = await loadInvoice(sql, labId, branchId, data.reportId);
    if (!current) throw new Error("التقرير غير موجود");
    const check = checkPayment(data.amount, current.remaining);
    if (!check.ok) throw new Error(check.error);
    const method = PAYMENT_METHODS.includes(data.method as PaymentMethod) ? (data.method as PaymentMethod) : "cash";
    const id = randomUUID();
    await sql.query(`insert into report_payments (id, lab_id, report_id, amount, method, note, created_by) values ($1,$2,$3,$4,$5,$6,$7)`, [
      id, labId, data.reportId, check.amount / 100, method, (data.note ?? "").trim().slice(0, 120) || null, labUserId,
    ]);
    await logAudit(sql, { labId, actorUserId: labUserId, actorAuthUserId: context.userId, action: "billing.payment_added", entityType: "report", entityId: data.reportId });
    return (await loadInvoice(sql, labId, branchId, data.reportId))!;
  });

/** Mistakes happen: a payment can be removed (it is audited). */
export const deleteReportPayment = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context, data }: { context: { userId: string }; data: { reportId: string; paymentId: string } }): Promise<ReportInvoice> => {
    const { sql, labId, labUserId, branchId } = await billingContext(context.userId);
    if (!(await loadInvoice(sql, labId, branchId, data.reportId))) throw new Error("التقرير غير موجود");
    await sql.query(`delete from report_payments where id = $1 and report_id = $2 and lab_id = $3`, [data.paymentId, data.reportId, labId]);
    await logAudit(sql, { labId, actorUserId: labUserId, actorAuthUserId: context.userId, action: "billing.payment_deleted", entityType: "report", entityId: data.reportId });
    return (await loadInvoice(sql, labId, branchId, data.reportId))!;
  });

// ───────────────────────── summary ─────────────────────────

export type BillingSummary = {
  /** Invoices created today. */
  todayCount: number;
  todayBilled: number;
  /** Money received today (any invoice). */
  todayCollected: number;
  /** All unpaid balances, ever. */
  outstanding: number;
  unpaid: { reportId: string; patientName: string; total: number; paid: number; remaining: number; createdAt: string }[];
};

export const getBillingSummary = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<BillingSummary> => {
    const { sql, labId, branchId } = await billingContext(context.userId);
    // "Today" in the lab's own day (Cairo), not the server's UTC day.
    const today = await sql<{ n: number; billed: string | null; collected: string | null }>`
      select
        (select count(*)::int from reports r where r.lab_id = ${labId} and (${branchId}::text is null or r.branch_id = ${branchId})
           and (r.created_at at time zone 'Africa/Cairo')::date = (now() at time zone 'Africa/Cairo')::date and r.total_price > 0) as n,
        (select sum(r.total_price - least(r.discount, r.total_price)) from reports r where r.lab_id = ${labId} and (${branchId}::text is null or r.branch_id = ${branchId})
           and (r.created_at at time zone 'Africa/Cairo')::date = (now() at time zone 'Africa/Cairo')::date) as billed,
        (select sum(p.amount) from report_payments p join reports r on r.id = p.report_id where p.lab_id = ${labId} and (${branchId}::text is null or r.branch_id = ${branchId})
           and (p.created_at at time zone 'Africa/Cairo')::date = (now() at time zone 'Africa/Cairo')::date) as collected
    `;
    const owed = await sql<{ id: string; full_name: string; total: string; paid: string; created_at: string | Date }>`
      select r.id, p.full_name, (r.total_price - least(r.discount, r.total_price)) as total,
             coalesce((select sum(amount) from report_payments where report_id = r.id), 0) as paid, r.created_at
      from reports r join patients p on p.id = r.patient_id
      where r.lab_id = ${labId} and (${branchId}::text is null or r.branch_id = ${branchId}) and r.status <> 'cancelled' and r.total_price > 0
      order by r.created_at desc
    `;
    const unpaid = owed
      .map((r) => ({ reportId: r.id, patientName: r.full_name, total: toPiastres(r.total), paid: toPiastres(r.paid), createdAt: new Date(r.created_at).toISOString() }))
      .map((r) => ({ ...r, remaining: Math.max(0, r.total - r.paid) }))
      .filter((r) => r.remaining > 0);
    return {
      todayCount: today[0]?.n ?? 0,
      todayBilled: toPiastres(today[0]?.billed),
      todayCollected: toPiastres(today[0]?.collected),
      outstanding: unpaid.reduce((n, r) => n + r.remaining, 0),
      unpaid: unpaid.slice(0, 100),
    };
  });
