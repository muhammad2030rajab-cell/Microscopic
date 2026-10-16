import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { useMemo, useState, type ReactNode } from "react";
import { Cpu, FlaskConical, History, Minus, Pencil, Plus, Search, Trash2, Wrench } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { getCurrentLab, type LabProfileData } from "@/lib/lab-access";
import {
  deleteDevice,
  deleteSupply,
  listInventory,
  listSupplyMoves,
  moveSupply,
  saveDevice,
  saveSupply,
  type Device,
  type Supply,
  type SupplyMove,
} from "@/lib/inventory";
import {
  DEVICE_STATUSES,
  DEVICE_STATUS_LABELS,
  MOVE_KIND_LABELS,
  daysBetween,
  expiryState,
  formatQuantity,
  serviceState,
  stockState,
  summarizeInventory,
  todayInCairo,
  warrantyState,
  type DeviceStatus,
} from "@/lib/inventory-math";
import { cn } from "@/lib/utils";

type Loaded = { lab: LabProfileData | null; denied: boolean; devices: Device[]; supplies: Supply[] };

export const Route = createFileRoute("/inventory")({
  ssr: false,
  loader: async (): Promise<Loaded> => {
    let lab: LabProfileData | null = null;
    try {
      lab = await getCurrentLab();
    } catch {
      return { lab: null, denied: false, devices: [], supplies: [] };
    }
    try {
      const res = await listInventory();
      return { lab, denied: false, ...res };
    } catch {
      return { lab, denied: true, devices: [], supplies: [] }; // signed in, but no inventory permission
    }
  },
  component: InventoryPage,
});

type Tab = "supplies" | "devices";
type SupplyDraft = { id: string | null; name: string; unit: string; quantity: string; minQuantity: string; expiryDate: string; lotNo: string; supplier: string; notes: string };
type DeviceDraft = { id: string | null; name: string; model: string; serialNo: string; location: string; status: DeviceStatus; purchaseDate: string; warrantyUntil: string; lastServiceDate: string; nextServiceDate: string; notes: string };
type MoveDraft = { id: string; kind: "in" | "out"; amount: string; note: string };

const EMPTY_SUPPLY: SupplyDraft = { id: null, name: "", unit: "", quantity: "", minQuantity: "", expiryDate: "", lotNo: "", supplier: "", notes: "" };
const EMPTY_DEVICE: DeviceDraft = { id: null, name: "", model: "", serialNo: "", location: "", status: "working", purchaseDate: "", warrantyUntil: "", lastServiceDate: "", nextServiceDate: "", notes: "" };

const fail = (err: unknown, fallback: string) => (err instanceof Error && err.message ? err.message : fallback);

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs text-muted">{label}</span>
      {children}
    </label>
  );
}

function DateText({ value }: { value: string }) {
  return (
    <span dir="ltr" className="inline-block">
      {value}
    </span>
  );
}

function InventoryPage() {
  const loaded = Route.useLoaderData();
  const [tab, setTab] = useState<Tab>("supplies");
  const [supplies, setSupplies] = useState<Supply[]>(loaded.supplies);
  const [devices, setDevices] = useState<Device[]>(loaded.devices);
  const [q, setQ] = useState("");
  const [attentionOnly, setAttentionOnly] = useState(false);
  const [supplyDraft, setSupplyDraft] = useState<SupplyDraft | null>(null);
  const [deviceDraft, setDeviceDraft] = useState<DeviceDraft | null>(null);
  const [moveDraft, setMoveDraft] = useState<MoveDraft | null>(null);
  const [history, setHistory] = useState<{ id: string; moves: SupplyMove[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const today = useMemo(() => todayInCairo(), []);
  const summary = useMemo(() => summarizeInventory(supplies, devices, today), [supplies, devices, today]);

  const shownSupplies = useMemo(() => {
    const term = q.trim().toLowerCase();
    return supplies
      .filter((s) => !term || `${s.name} ${s.supplier ?? ""} ${s.lotNo ?? ""}`.toLowerCase().includes(term))
      .filter((s) => {
        if (!attentionOnly) return true;
        const e = expiryState(s.expiryDate, today);
        return stockState(s.quantity, s.minQuantity) !== "ok" || e === "soon" || e === "expired";
      });
  }, [supplies, q, attentionOnly, today]);

  const shownDevices = useMemo(() => {
    const term = q.trim().toLowerCase();
    return devices
      .filter((d) => !term || `${d.name} ${d.model ?? ""} ${d.serialNo ?? ""} ${d.location ?? ""}`.toLowerCase().includes(term))
      .filter((d) => {
        if (!attentionOnly) return true;
        const s = serviceState(d.nextServiceDate, today);
        return d.status !== "working" || s === "soon" || s === "overdue";
      });
  }, [devices, q, attentionOnly, today]);

  if (!loaded.lab) return <Navigate to="/login" replace />;

  if (loaded.denied) {
    return (
      <AppShell>
        <div className="rounded-xl border border-dashed border-line bg-elevated p-6 text-sm leading-7 text-muted">
          ملكش صلاحية الأجهزة والمستلزمات. اطلبها من مالك المعمل.
          <div className="mt-3">
            <Link to="/lab" className="text-teal hover:underline">رجوع للوحة المعمل</Link>
          </div>
        </div>
      </AppShell>
    );
  }

  async function refresh() {
    const fresh = await listInventory();
    setSupplies(fresh.supplies);
    setDevices(fresh.devices);
  }

  /** Runs one action with the busy flag and a message; `after` runs only when it worked. */
  async function run(action: () => Promise<unknown>, okText: string | null, fallback: string, after?: () => void) {
    setBusy(true);
    setMessage(null);
    try {
      await action();
      await refresh();
      after?.();
      if (okText) setMessage({ ok: true, text: okText });
    } catch (err) {
      setMessage({ ok: false, text: fail(err, fallback) });
    } finally {
      setBusy(false);
    }
  }

  function saveSupplyDraft() {
    if (!supplyDraft) return;
    const d = supplyDraft;
    void run(() => saveSupply({ data: { ...d } }), "تم الحفظ.", "تعذر الحفظ", () => setSupplyDraft(null));
  }

  function saveDeviceDraft() {
    if (!deviceDraft) return;
    const d = deviceDraft;
    void run(() => saveDevice({ data: { ...d } }), "تم الحفظ.", "تعذر الحفظ", () => setDeviceDraft(null));
  }

  function removeSupply(s: Supply) {
    if (!window.confirm(`حذف «${s.name}» وكل حركاته؟`)) return;
    void run(() => deleteSupply({ data: { id: s.id } }), null, "تعذر الحذف", () => setHistory((h) => (h?.id === s.id ? null : h)));
  }

  function removeDevice(d: Device) {
    if (!window.confirm(`حذف «${d.name}»؟`)) return;
    void run(() => deleteDevice({ data: { id: d.id } }), null, "تعذر الحذف");
  }

  function submitMove() {
    if (!moveDraft) return;
    const m = moveDraft;
    void run(
      () => moveSupply({ data: { id: m.id, kind: m.kind, amount: m.amount, note: m.note } }),
      m.kind === "in" ? "اتسجّل الوارد." : "اتسجّل المنصرف.",
      "تعذر تسجيل الحركة",
      () => {
        setMoveDraft(null);
        setHistory((h) => (h?.id === m.id ? null : h));
      },
    );
  }

  async function toggleHistory(id: string) {
    if (history?.id === id) {
      setHistory(null);
      return;
    }
    setMessage(null);
    try {
      setHistory({ id, moves: await listSupplyMoves({ data: { id } }) });
    } catch (err) {
      setMessage({ ok: false, text: fail(err, "تعذر تحميل السجل") });
    }
  }

  const chip = (label: string, value: number) => (
    <div className={cn("rounded-xl border bg-elevated p-3", value > 0 ? "border-low/40" : "border-line")}>
      <p className={cn("font-display text-2xl font-semibold", value > 0 ? "text-low" : "text-ok")}>{value}</p>
      <p className="mt-0.5 text-xs text-muted">{label}</p>
    </div>
  );

  return (
    <AppShell>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-2xl font-semibold">الأجهزة والمستلزمات</h1>
        <div className="inline-flex overflow-hidden rounded-lg border border-line text-sm" role="tablist">
          {(["supplies", "devices"] as const).map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={tab === t}
              onClick={() => {
                setTab(t);
                setSupplyDraft(null);
                setDeviceDraft(null);
                setMoveDraft(null);
                setMessage(null);
              }}
              className={cn("inline-flex min-h-10 items-center gap-2 px-4", tab === t ? "bg-teal text-white" : "bg-elevated text-ink-soft")}
            >
              {t === "supplies" ? <FlaskConical className="size-4" /> : <Cpu className="size-4" />}
              {t === "supplies" ? "المستلزمات" : "الأجهزة"}
            </button>
          ))}
        </div>
      </div>

      <section aria-label="تنبيهات" className="mb-4 grid grid-cols-3 gap-2.5">
        {chip("نواقص / نفدت", summary.lowOrOut)}
        {chip("منتهية / قربت تنتهي", summary.expiringOrExpired)}
        {chip("أجهزة محتاجة متابعة", summary.devicesNeedingAttention)}
      </section>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative min-w-52 flex-1">
          <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={tab === "supplies" ? "ابحث في المستلزمات…" : "ابحث في الأجهزة…"} className="ps-9" />
        </div>
        <label className="inline-flex min-h-10 cursor-pointer items-center gap-2 text-sm text-ink-soft">
          <input type="checkbox" className="size-4 accent-teal" checked={attentionOnly} onChange={(e) => setAttentionOnly(e.target.checked)} />
          اللي محتاج متابعة بس
        </label>
        <Button
          type="button"
          disabled={busy}
          onClick={() => (tab === "supplies" ? setSupplyDraft({ ...EMPTY_SUPPLY }) : setDeviceDraft({ ...EMPTY_DEVICE }))}
        >
          <Plus className="size-4" />
          {tab === "supplies" ? "إضافة مستلزم" : "إضافة جهاز"}
        </Button>
      </div>

      {message ? (
        <p className={cn("mb-4 rounded-lg border px-3 py-2 text-sm", message.ok ? "border-ok/20 bg-ok/5 text-ok" : "border-high/20 bg-high/5 text-high")}>
          {message.text}
        </p>
      ) : null}

      {tab === "supplies" && supplyDraft ? (
        <section className="mb-4 space-y-3 app-card p-4">
          <h2 className="text-sm font-semibold">{supplyDraft.id ? "تعديل مستلزم" : "إضافة مستلزم"}</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="الاسم">
              <Input value={supplyDraft.name} onChange={(e) => setSupplyDraft({ ...supplyDraft, name: e.target.value })} placeholder="مثال: أنابيب EDTA" />
            </Field>
            <Field label="الوحدة">
              <Input value={supplyDraft.unit} onChange={(e) => setSupplyDraft({ ...supplyDraft, unit: e.target.value })} placeholder="علبة، زجاجة، كيس…" />
            </Field>
            <Field label={supplyDraft.id ? "الكمية الحالية (تعديلها بيتسجّل كتسوية)" : "الكمية"}>
              <Input inputMode="decimal" dir="ltr" className="text-end" value={supplyDraft.quantity} onChange={(e) => setSupplyDraft({ ...supplyDraft, quantity: e.target.value })} placeholder="0" />
            </Field>
            <Field label="الحد الأدنى (تنبيه لما الكمية توصله)">
              <Input inputMode="decimal" dir="ltr" className="text-end" value={supplyDraft.minQuantity} onChange={(e) => setSupplyDraft({ ...supplyDraft, minQuantity: e.target.value })} placeholder="0" />
            </Field>
            <Field label="تاريخ الانتهاء">
              <Input type="date" dir="ltr" className="text-end" value={supplyDraft.expiryDate} onChange={(e) => setSupplyDraft({ ...supplyDraft, expiryDate: e.target.value })} />
            </Field>
            <Field label="رقم التشغيلة (Lot)">
              <Input dir="ltr" className="text-end" value={supplyDraft.lotNo} onChange={(e) => setSupplyDraft({ ...supplyDraft, lotNo: e.target.value })} />
            </Field>
            <Field label="المورّد">
              <Input value={supplyDraft.supplier} onChange={(e) => setSupplyDraft({ ...supplyDraft, supplier: e.target.value })} />
            </Field>
          </div>
          <Textarea aria-label="ملاحظات" placeholder="ملاحظات (اختياري)" value={supplyDraft.notes} onChange={(e) => setSupplyDraft({ ...supplyDraft, notes: e.target.value })} />
          <div className="flex gap-2">
            <Button type="button" onClick={saveSupplyDraft} disabled={busy}>حفظ</Button>
            <Button type="button" variant="secondary" onClick={() => setSupplyDraft(null)} disabled={busy}>إلغاء</Button>
          </div>
        </section>
      ) : null}

      {tab === "devices" && deviceDraft ? (
        <section className="mb-4 space-y-3 app-card p-4">
          <h2 className="text-sm font-semibold">{deviceDraft.id ? "تعديل جهاز" : "إضافة جهاز"}</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="اسم الجهاز">
              <Input value={deviceDraft.name} onChange={(e) => setDeviceDraft({ ...deviceDraft, name: e.target.value })} placeholder="مثال: جهاز كيمياء" />
            </Field>
            <Field label="الموديل">
              <Input dir="ltr" className="text-end" value={deviceDraft.model} onChange={(e) => setDeviceDraft({ ...deviceDraft, model: e.target.value })} />
            </Field>
            <Field label="الرقم التسلسلي">
              <Input dir="ltr" className="text-end" value={deviceDraft.serialNo} onChange={(e) => setDeviceDraft({ ...deviceDraft, serialNo: e.target.value })} />
            </Field>
            <Field label="المكان">
              <Input value={deviceDraft.location} onChange={(e) => setDeviceDraft({ ...deviceDraft, location: e.target.value })} placeholder="مثال: قسم الكيمياء" />
            </Field>
            <Field label="الحالة">
              <NativeSelect value={deviceDraft.status} onChange={(e) => setDeviceDraft({ ...deviceDraft, status: e.target.value as DeviceStatus })}>
                {DEVICE_STATUSES.map((s) => (
                  <option key={s} value={s}>{DEVICE_STATUS_LABELS[s]}</option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="تاريخ الشراء">
              <Input type="date" dir="ltr" className="text-end" value={deviceDraft.purchaseDate} onChange={(e) => setDeviceDraft({ ...deviceDraft, purchaseDate: e.target.value })} />
            </Field>
            <Field label="نهاية الضمان">
              <Input type="date" dir="ltr" className="text-end" value={deviceDraft.warrantyUntil} onChange={(e) => setDeviceDraft({ ...deviceDraft, warrantyUntil: e.target.value })} />
            </Field>
            <Field label="آخر صيانة">
              <Input type="date" dir="ltr" className="text-end" value={deviceDraft.lastServiceDate} onChange={(e) => setDeviceDraft({ ...deviceDraft, lastServiceDate: e.target.value })} />
            </Field>
            <Field label="الصيانة القادمة">
              <Input type="date" dir="ltr" className="text-end" value={deviceDraft.nextServiceDate} onChange={(e) => setDeviceDraft({ ...deviceDraft, nextServiceDate: e.target.value })} />
            </Field>
          </div>
          <Textarea aria-label="ملاحظات" placeholder="ملاحظات (اختياري)" value={deviceDraft.notes} onChange={(e) => setDeviceDraft({ ...deviceDraft, notes: e.target.value })} />
          <div className="flex gap-2">
            <Button type="button" onClick={saveDeviceDraft} disabled={busy}>حفظ</Button>
            <Button type="button" variant="secondary" onClick={() => setDeviceDraft(null)} disabled={busy}>إلغاء</Button>
          </div>
        </section>
      ) : null}

      {tab === "supplies" ? (
        shownSupplies.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line px-4 py-10 text-center text-sm text-muted">
            {q || attentionOnly ? "مفيش نتائج." : "لسه مضفتش مستلزمات."}
          </p>
        ) : (
          <ul className="space-y-3">
            {shownSupplies.map((s) => {
              const stock = stockState(s.quantity, s.minQuantity);
              const expiry = expiryState(s.expiryDate, today);
              const unit = s.unit ? ` ${s.unit}` : "";
              const moving = moveDraft?.id === s.id ? moveDraft : null;
              return (
                <li key={s.id} className="app-card p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{s.name}</p>
                      <p className="mt-0.5 text-xs text-muted">
                        {[s.supplier, s.lotNo ? `Lot ${s.lotNo}` : null].filter(Boolean).join(" · ") || "—"}
                      </p>
                    </div>
                    <p className={cn("font-display text-xl font-semibold", stock === "out" ? "text-high" : stock === "low" ? "text-low" : "text-ink")}>
                      {formatQuantity(s.quantity)}
                      <span className="text-xs font-normal text-muted">{unit}</span>
                    </p>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
                    {stock === "out" ? <Badge tone="high">نفد</Badge> : null}
                    {stock === "low" ? <Badge tone="low">ناقص (الحد الأدنى {formatQuantity(s.minQuantity)})</Badge> : null}
                    {expiry === "expired" && s.expiryDate ? <Badge tone="high">منتهي الصلاحية</Badge> : null}
                    {expiry === "soon" && s.expiryDate ? <Badge tone="low">ينتهي بعد {daysBetween(today, s.expiryDate)} يوم</Badge> : null}
                    {s.expiryDate ? (
                      <span className="text-muted">
                        الانتهاء: <DateText value={s.expiryDate} />
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={() => setMoveDraft({ id: s.id, kind: "in", amount: "", note: "" })}>
                      <Plus className="size-4" />
                      وارد
                    </Button>
                    <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={() => setMoveDraft({ id: s.id, kind: "out", amount: "", note: "" })}>
                      <Minus className="size-4" />
                      منصرف
                    </Button>
                    <Button type="button" size="sm" variant="ghost" onClick={() => void toggleHistory(s.id)}>
                      <History className="size-4" />
                      السجل
                    </Button>
                    <span className="ms-auto flex items-center gap-1">
                      <button
                        type="button"
                        aria-label="تعديل"
                        className="grid size-9 place-items-center rounded-lg text-ink-soft hover:bg-paper-2"
                        onClick={() =>
                          setSupplyDraft({
                            id: s.id,
                            name: s.name,
                            unit: s.unit ?? "",
                            quantity: String(s.quantity),
                            minQuantity: String(s.minQuantity),
                            expiryDate: s.expiryDate ?? "",
                            lotNo: s.lotNo ?? "",
                            supplier: s.supplier ?? "",
                            notes: s.notes ?? "",
                          })
                        }
                      >
                        <Pencil className="size-4" />
                      </button>
                      <button type="button" aria-label="حذف" className="grid size-9 place-items-center rounded-lg text-high hover:bg-high-bg" onClick={() => removeSupply(s)} disabled={busy}>
                        <Trash2 className="size-4" />
                      </button>
                    </span>
                  </div>

                  {moving ? (
                    <div className="mt-3 space-y-2 rounded-lg border border-line bg-paper p-3">
                      <p className="text-xs font-semibold">{moving.kind === "in" ? "تسجيل وارد" : "تسجيل منصرف"}</p>
                      <div className="grid gap-2 sm:grid-cols-2">
                        <Input
                          aria-label="الكمية"
                          inputMode="decimal"
                          dir="ltr"
                          className="text-end"
                          placeholder={`الكمية${unit}`}
                          value={moving.amount}
                          onChange={(e) => setMoveDraft({ ...moving, amount: e.target.value })}
                        />
                        <Input aria-label="ملاحظة" placeholder="ملاحظة (اختياري)" value={moving.note} onChange={(e) => setMoveDraft({ ...moving, note: e.target.value })} />
                      </div>
                      <div className="flex gap-2">
                        <Button type="button" size="sm" onClick={submitMove} disabled={busy}>تسجيل</Button>
                        <Button type="button" size="sm" variant="secondary" onClick={() => setMoveDraft(null)} disabled={busy}>إلغاء</Button>
                      </div>
                    </div>
                  ) : null}

                  {history?.id === s.id ? (
                    <ul className="mt-3 divide-y divide-line rounded-lg border border-line bg-paper text-xs">
                      {history.moves.length === 0 ? (
                        <li className="px-3 py-2 text-muted">مفيش حركات لسه.</li>
                      ) : (
                        history.moves.map((m) => (
                          <li key={m.id} className="flex items-center justify-between gap-3 px-3 py-2">
                            <span className="min-w-0">
                              <span className="font-medium">{MOVE_KIND_LABELS[m.kind]}</span>
                              {m.note ? <span className="text-muted"> · {m.note}</span> : null}
                              <span className="block text-muted" dir="ltr">{m.createdAt}</span>
                            </span>
                            <span dir="ltr" className={cn("shrink-0 font-semibold", m.delta < 0 ? "text-high" : "text-ok")}>
                              {m.delta > 0 ? "+" : ""}
                              {formatQuantity(m.delta)}
                            </span>
                          </li>
                        ))
                      )}
                    </ul>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )
      ) : shownDevices.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line px-4 py-10 text-center text-sm text-muted">
          {q || attentionOnly ? "مفيش نتائج." : "لسه مضفتش أجهزة."}
        </p>
      ) : (
        <ul className="space-y-3">
          {shownDevices.map((d) => {
            const service = serviceState(d.nextServiceDate, today);
            const warranty = warrantyState(d.warrantyUntil, today);
            return (
              <li key={d.id} className="app-card p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{d.name}</p>
                    <p className="mt-0.5 truncate text-xs text-muted" dir="auto">
                      {[d.model, d.serialNo ? `S/N ${d.serialNo}` : null, d.location].filter(Boolean).join(" · ") || "—"}
                    </p>
                  </div>
                  <Badge tone={d.status === "working" ? "ok" : d.status === "maintenance" ? "low" : "high"}>{DEVICE_STATUS_LABELS[d.status]}</Badge>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
                  {service === "overdue" ? <Badge tone="high">الصيانة متأخرة</Badge> : null}
                  {service === "soon" && d.nextServiceDate ? <Badge tone="low">صيانة بعد {daysBetween(today, d.nextServiceDate)} يوم</Badge> : null}
                  {warranty === "expired" ? <Badge tone="muted">الضمان انتهى</Badge> : null}
                  {d.nextServiceDate ? (
                    <span className="text-muted">
                      الصيانة القادمة: <DateText value={d.nextServiceDate} />
                    </span>
                  ) : null}
                  {d.lastServiceDate ? (
                    <span className="text-muted">
                      · آخر صيانة: <DateText value={d.lastServiceDate} />
                    </span>
                  ) : null}
                  {warranty === "active" && d.warrantyUntil ? (
                    <span className="text-muted">
                      · الضمان لحد <DateText value={d.warrantyUntil} />
                    </span>
                  ) : null}
                </div>
                {d.notes ? <p className="mt-2 text-xs leading-6 text-ink-soft">{d.notes}</p> : null}
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    disabled={busy}
                    onClick={() =>
                      setDeviceDraft({
                        id: d.id,
                        name: d.name,
                        model: d.model ?? "",
                        serialNo: d.serialNo ?? "",
                        location: d.location ?? "",
                        status: "working",
                        purchaseDate: d.purchaseDate ?? "",
                        warrantyUntil: d.warrantyUntil ?? "",
                        lastServiceDate: today,
                        nextServiceDate: "",
                        notes: d.notes ?? "",
                      })
                    }
                  >
                    <Wrench className="size-4" />
                    تمت الصيانة
                  </Button>
                  <span className="ms-auto flex items-center gap-1">
                    <button
                      type="button"
                      aria-label="تعديل"
                      className="grid size-9 place-items-center rounded-lg text-ink-soft hover:bg-paper-2"
                      onClick={() =>
                        setDeviceDraft({
                          id: d.id,
                          name: d.name,
                          model: d.model ?? "",
                          serialNo: d.serialNo ?? "",
                          location: d.location ?? "",
                          status: d.status,
                          purchaseDate: d.purchaseDate ?? "",
                          warrantyUntil: d.warrantyUntil ?? "",
                          lastServiceDate: d.lastServiceDate ?? "",
                          nextServiceDate: d.nextServiceDate ?? "",
                          notes: d.notes ?? "",
                        })
                      }
                    >
                      <Pencil className="size-4" />
                    </button>
                    <button type="button" aria-label="حذف" className="grid size-9 place-items-center rounded-lg text-high hover:bg-high-bg" onClick={() => removeDevice(d)} disabled={busy}>
                      <Trash2 className="size-4" />
                    </button>
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </AppShell>
  );
}
