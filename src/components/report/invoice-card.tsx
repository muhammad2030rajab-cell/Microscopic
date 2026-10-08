import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { addReportPayment, deleteReportPayment, getReportInvoice, setReportDiscount, type ReportInvoice } from "@/lib/billing";
import { PAYMENT_METHODS, PAYMENT_METHOD_LABELS, formatMoney, type PaymentMethod } from "@/lib/billing-math";

const STATUS: Record<ReportInvoice["status"], { text: string; cls: string }> = {
  unpriced: { text: "بدون سعر", cls: "bg-paper-2 text-ink-soft" },
  unpaid: { text: "غير مدفوع", cls: "bg-high/10 text-high" },
  partial: { text: "مدفوع جزئيًا", cls: "bg-amber-500/10 text-amber-600" },
  paid: { text: "مدفوع", cls: "bg-ok/10 text-ok" },
};

/** The invoice of one report (staff with the billing permission only; hidden for everyone else and never printed). */
export function InvoiceCard({ reportId }: { reportId: string }) {
  const [invoice, setInvoice] = useState<ReportInvoice | null | undefined>(undefined);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [discount, setDiscount] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const inv = await getReportInvoice({ data: { reportId } });
      setInvoice(inv);
      setDiscount(inv && inv.discount ? String(inv.discount / 100) : "");
    } catch {
      setInvoice(null); // no billing permission (or offline): show nothing
    }
  }, [reportId]);
  useEffect(() => {
    void load();
  }, [load]);

  async function run(fn: () => Promise<ReportInvoice>) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const inv = await fn();
      setInvoice(inv);
      setDiscount(inv.discount ? String(inv.discount / 100) : "");
      setAmount("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذر تنفيذ العملية");
    } finally {
      setBusy(false);
    }
  }

  if (!invoice) return null;
  const st = STATUS[invoice.status];
  const pay = (e: FormEvent) => {
    e.preventDefault();
    void run(() => addReportPayment({ data: { reportId, amount, method } }));
  };

  return (
    <section className="mb-5 rounded-lg border border-line bg-elevated p-4 text-sm print:hidden">
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-ink-soft">الفاتورة <span className="text-muted">(للحسابات فقط، مش بتتطبع)</span></p>
        <span className={`rounded-full px-2.5 py-0.5 text-xs ${st.cls}`}>{st.text}</span>
      </div>

      {invoice.status === "unpriced" ? (
        <p className="text-xs leading-6 text-muted">مفيش أسعار للتحاليل دي. حدّد الأسعار من صفحة «الحسابات ← الأسعار»، وهتتطبق على التقارير الجديدة أو لما التقرير يتعدّل.</p>
      ) : (
        <>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-4">
            <div><dt className="text-xs text-muted">الإجمالي</dt><dd className="font-semibold">{formatMoney(invoice.subtotal)}</dd></div>
            <div><dt className="text-xs text-muted">الخصم</dt><dd className="font-semibold">{formatMoney(invoice.discount)}</dd></div>
            <div><dt className="text-xs text-muted">المدفوع</dt><dd className="font-semibold text-ok">{formatMoney(invoice.paid)}</dd></div>
            <div><dt className="text-xs text-muted">المتبقي</dt><dd className={`font-semibold ${invoice.remaining ? "text-high" : ""}`}>{formatMoney(invoice.remaining)}</dd></div>
          </dl>
          {invoice.overpaid ? <p className="mt-2 text-xs text-amber-600">المدفوع أكبر من الفاتورة بـ {formatMoney(invoice.overpaid)} (مستحق رد).</p> : null}

          {invoice.payments.length ? (
            <ul className="mt-3 divide-y divide-line rounded-lg border border-line">
              {invoice.payments.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-2 px-3 py-2 text-xs">
                  <span>{formatMoney(p.amount)} · {PAYMENT_METHOD_LABELS[p.method]} · {new Date(p.createdAt).toLocaleString("ar-EG", { day: "numeric", month: "numeric", hour: "numeric", minute: "2-digit" })}</span>
                  <button type="button" aria-label="حذف الدفعة" className="text-muted hover:text-high" onClick={() => { if (window.confirm("حذف الدفعة دي؟")) void run(() => deleteReportPayment({ data: { reportId, paymentId: p.id } })); }}><Trash2 className="size-3.5" /></button>
                </li>
              ))}
            </ul>
          ) : null}

          {invoice.remaining > 0 ? (
            <form onSubmit={pay} className="mt-3 flex flex-wrap items-end gap-2">
              <div className="w-28"><label htmlFor="pay-amount" className="mb-1 block text-xs text-muted">مبلغ الدفعة</label><Input id="pay-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" dir="ltr" /></div>
              <select aria-label="طريقة الدفع" value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)} className="h-11 rounded-sm border border-line bg-elevated px-2 text-sm">
                {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{PAYMENT_METHOD_LABELS[m]}</option>)}
              </select>
              <Button type="submit" size="sm" disabled={busy || !amount.trim()}>{busy ? <Loader2 className="animate-spin" /> : null} تسجيل دفعة</Button>
              <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => setAmount(String(invoice.remaining / 100))}>الباقي كله</Button>
            </form>
          ) : null}

          <div className="mt-3 flex items-end gap-2">
            <div className="w-28"><label htmlFor="disc" className="mb-1 block text-xs text-muted">الخصم (ج.م)</label><Input id="disc" inputMode="decimal" value={discount} onChange={(e) => setDiscount(e.target.value)} placeholder="0" dir="ltr" /></div>
            <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => void run(() => setReportDiscount({ data: { reportId, discount } }))}>حفظ الخصم</Button>
          </div>
        </>
      )}
      {error ? <p className="mt-2 rounded-lg border border-high/20 bg-high/5 px-3 py-2 text-xs text-high">{error}</p> : null}
    </section>
  );
}
