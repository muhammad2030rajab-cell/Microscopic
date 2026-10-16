import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Banknote, Receipt, Search, Wallet } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getCurrentLab, type LabProfileData } from "@/lib/lab-access";
import { getBillingSummary, listTestPrices, setTestPrices, type BillingSummary, type PriceRow } from "@/lib/billing";
import { formatMoney } from "@/lib/billing-math";

type Loaded = { lab: LabProfileData | null; denied: boolean; summary: BillingSummary | null; prices: PriceRow[] };

export const Route = createFileRoute("/billing")({
  loader: async (): Promise<Loaded> => {
    let lab: LabProfileData | null = null;
    try {
      lab = await getCurrentLab();
    } catch {
      return { lab: null, denied: false, summary: null, prices: [] };
    }
    try {
      const [summary, prices] = await Promise.all([getBillingSummary(), listTestPrices()]);
      return { lab, denied: false, summary, prices };
    } catch {
      return { lab, denied: true, summary: null, prices: [] }; // signed in, but no billing permission
    }
  },
  component: BillingPage,
});

function Stat({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: string; tone?: string }) {
  return (
    <div className="app-card p-4">
      <div className="mb-2 text-muted">{icon}</div>
      <p className={`font-display text-2xl font-semibold ${tone ?? ""}`}>{value}</p>
      <p className="mt-0.5 text-xs text-muted">{label}</p>
    </div>
  );
}

function BillingPage() {
  const { lab, denied, summary, prices } = Route.useLoaderData();
  const [tab, setTab] = useState<"today" | "prices">("today");
  if (!lab) return <Navigate to="/login" replace />;
  if (denied || !summary) {
    return (
      <AppShell>
        <div className="rounded-xl border border-dashed border-line bg-elevated p-6 text-sm leading-7 text-muted">
          ملكش صلاحية «الحسابات». اطلبها من مالك المعمل.
          <div className="mt-3"><Link to="/lab" className="text-teal hover:underline">رجوع للوحة المعمل</Link></div>
        </div>
      </AppShell>
    );
  }
  return (
    <AppShell>
      <div className="mb-5 flex items-center justify-between gap-3">
        <h1 className="font-display text-2xl font-semibold">الحسابات</h1>
        <div className="inline-flex overflow-hidden rounded-lg border border-line text-sm" role="tablist">
          {([["today", "اليوم والمتأخرات"], ["prices", "الأسعار"]] as const).map(([key, label]) => (
            <button key={key} type="button" role="tab" aria-selected={tab === key} onClick={() => setTab(key)} className={`min-h-10 px-4 ${tab === key ? "bg-ink text-paper" : "bg-elevated text-ink-soft"}`}>{label}</button>
          ))}
        </div>
      </div>
      {tab === "today" ? <TodayTab summary={summary} /> : <PricesTab initial={prices} />}
    </AppShell>
  );
}

function TodayTab({ summary }: { summary: BillingSummary }) {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat icon={<Receipt className="size-5" />} label={`فواتير اليوم (${summary.todayCount})`} value={formatMoney(summary.todayBilled)} />
        <Stat icon={<Banknote className="size-5" />} label="المحصّل اليوم" value={formatMoney(summary.todayCollected)} tone="text-ok" />
        <Stat icon={<Wallet className="size-5" />} label="إجمالي المتبقي عند المرضى" value={formatMoney(summary.outstanding)} tone={summary.outstanding ? "text-high" : ""} />
      </div>
      <section className="app-card">
        <h2 className="border-b border-line px-4 py-3 text-sm font-medium">فواتير عليها متبقي {summary.unpaid.length ? `(${summary.unpaid.length})` : ""}</h2>
        {summary.unpaid.length === 0 ? <p className="p-6 text-center text-sm text-muted">مفيش متأخرات. 🎉</p> : (
          <ul className="divide-y divide-line">
            {summary.unpaid.map((r) => (
              <li key={r.reportId}>
                <Link to="/reports/$id" params={{ id: r.reportId }} className="flex items-center justify-between gap-3 px-4 py-3 text-sm hover:bg-paper-2">
                  <span className="min-w-0"><span className="block truncate font-medium">{r.patientName}</span><span className="text-xs text-muted">{new Date(r.createdAt).toLocaleDateString("ar-EG")} · الإجمالي {formatMoney(r.total)} · مدفوع {formatMoney(r.paid)}</span></span>
                  <span className="shrink-0 font-semibold text-high">{formatMoney(r.remaining)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function PricesTab({ initial }: { initial: PriceRow[] }) {
  const [rows, setRows] = useState(initial);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const shown = useMemo(() => {
    const term = q.trim().toLowerCase();
    return term ? rows.filter((r) => `${r.testName} ${r.categoryAr} ${r.categoryEn}`.toLowerCase().includes(term)) : rows;
  }, [rows, q]);
  const groups = useMemo(() => {
    const map = new Map<string, PriceRow[]>();
    for (const r of shown) map.set(r.categoryEn, [...(map.get(r.categoryEn) ?? []), r]);
    return [...map.entries()];
  }, [shown]);
  const valueOf = (r: PriceRow) => edits[r.id] ?? (r.price === null ? "" : String(r.price / 100));
  const dirty = Object.keys(edits).length;

  async function save() {
    setBusy(true);
    setMessage(null);
    try {
      await setTestPrices({ data: { items: Object.entries(edits).map(([id, price]) => ({ id, price })) } });
      const fresh = await listTestPrices();
      setRows(fresh);
      setEdits({});
      setMessage({ ok: true, text: "تم حفظ الأسعار. بتتطبق على التقارير الجديدة أو لما التقرير يتعدّل." });
    } catch (err) {
      setMessage({ ok: false, text: err instanceof Error ? err.message : "تعذر الحفظ" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-52 flex-1"><Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted" /><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ابحث عن تحليل…" className="ps-9" /></div>
        <Button type="button" onClick={save} disabled={busy || !dirty}>{dirty ? `حفظ (${dirty})` : "حفظ"}</Button>
      </div>
      {message ? <p className={`rounded-lg border px-3 py-2 text-sm ${message.ok ? "border-ok/20 bg-ok/5 text-ok" : "border-high/20 bg-high/5 text-high"}`}>{message.text}</p> : null}
      {groups.map(([cat, items]) => (
        <section key={cat} className="app-card">
          <h2 className="border-b border-line px-4 py-2.5 text-sm font-medium"><span dir="auto">{items[0].categoryAr} · {cat}</span></h2>
          <ul className="divide-y divide-line">
            {items.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 px-4 py-2">
                <span dir="ltr" className="min-w-0 truncate text-sm">{r.testName}</span>
                <span className="flex items-center gap-1.5"><Input aria-label={`سعر ${r.testName}`} inputMode="decimal" dir="ltr" value={valueOf(r)} onChange={(e) => setEdits((cur) => ({ ...cur, [r.id]: e.target.value }))} placeholder="—" className="h-9 w-24 text-end" /><span className="text-xs text-muted">ج.م</span></span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
