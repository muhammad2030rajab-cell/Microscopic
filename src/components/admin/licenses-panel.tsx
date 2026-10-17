import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { BadgeCheck, Check, Copy, KeyRound, Loader2, MessageCircle, MonitorSmartphone, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createLicense, issueLicenseDeviceKey, listLicenses, releaseLicenseDevice, setLicenseStatus, type LicenseRow } from "@/lib/license-admin";

const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("ar-EG") : "—");

type Filter = "all" | "waiting" | "active" | "revoked";
const liveDevices = (l: LicenseRow) => l.devices.filter((d) => !d.released);
const stateOf = (l: LicenseRow): Exclude<Filter, "all"> => (l.status === "revoked" ? "revoked" : liveDevices(l).length ? "active" : "waiting");
const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "الكل" },
  { id: "waiting", label: "مستنية تفعيل" },
  { id: "active", label: "متفعّلة" },
  { id: "revoked", label: "موقوفة" },
];

/** Issue a long key for one device straight from here: paste the device id the customer sent, send the key back. */
function DeviceKeyForm({ license, onError, onDone }: { license: LicenseRow; onError: (message: string | null) => void; onDone: () => void }) {
  const [deviceId, setDeviceId] = useState("");
  const [busy, setBusy] = useState(false);
  const [key, setKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function issue(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    onError(null);
    try {
      const res = await issueLicenseDeviceKey({ data: { id: license.id, deviceId, deviceName: license.note } });
      setKey(res.key);
      setDeviceId("");
      onDone();
    } catch (err) {
      onError(err instanceof Error ? err.message : "تعذر إصدار المفتاح");
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    if (!key) return;
    try {
      await navigator.clipboard.writeText(key);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      onError("النسخ مش متاح في المتصفح ده. انسخ يدوي.");
    }
  }

  if (key) {
    const message = `كود تفعيل Microscopic${license.note ? ` لـ ${license.note}` : ""}:\n\n${key}\n\nانسخه كامل والصقه في شاشة التفعيل (مرة واحدة فقط، ومش محتاج إنترنت).`;
    return (
      <div className="rounded-lg border border-teal/30 bg-teal/5 p-3 text-xs">
        <p className="text-muted">المفتاح ده شغّال على الجهاز ده بس. انسخه كامل وابعته للعميل.</p>
        <p dir="ltr" className="mt-2 max-h-20 select-all overflow-auto break-all rounded bg-paper-2 p-2 font-mono text-[11px] leading-5">{key}</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <Button size="sm" variant="outline" type="button" onClick={copy}>{copied ? <Check /> : <Copy />} نسخ المفتاح</Button>
          <Button size="sm" variant="outline" asChild><a href={`https://wa.me/?text=${encodeURIComponent(message)}`} target="_blank" rel="noreferrer"><MessageCircle /> واتساب</a></Button>
          <Button size="sm" variant="ghost" type="button" onClick={() => setKey(null)}>تم</Button>
        </div>
      </div>
    );
  }
  return (
    <form onSubmit={issue} className="flex flex-wrap items-end gap-2 rounded-lg bg-paper-2 px-3 py-2 text-xs">
      <div className="min-w-[14rem] flex-1">
        <Label htmlFor={`dev-${license.id}`} className="text-xs">ربط بجهاز (من غير إنترنت عند العميل): الصق رقم الجهاز</Label>
        <Input id={`dev-${license.id}`} dir="ltr" required value={deviceId} onChange={(e) => setDeviceId(e.target.value)} placeholder="XXXXXXXX-XXXXXXXX-..." className="mt-1 h-9 font-mono text-xs" />
      </div>
      <Button size="sm" type="submit" disabled={busy}>{busy ? <Loader2 className="animate-spin" /> : <KeyRound />} إصدار مفتاح</Button>
    </form>
  );
}

/** Licenses for the local program: make a code per sale, see which device activated it, revoke or free a device. */
export function LicensesPanel({ onError }: { onError: (message: string | null) => void }) {
  const [rows, setRows] = useState<LicenseRow[] | null>(null);
  const [note, setNote] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setRows(await listLicenses());
    } catch {
      setRows([]);
    }
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (rows ?? []).filter((l) => (filter === "all" || stateOf(l) === filter) && (!q || l.note.toLowerCase().includes(q) || l.devices.some((d) => d.deviceName.toLowerCase().includes(q))));
  }, [rows, query, filter]);

  async function create(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    onError(null);
    try {
      const res = await createLicense({ data: { note } });
      setCode(res.code);
      setNote("");
      await refresh();
    } catch (err) {
      onError(err instanceof Error ? err.message : "تعذر إنشاء الكود");
    } finally {
      setBusy(false);
    }
  }

  async function act(fn: () => Promise<unknown>, confirmText?: string) {
    if (confirmText && !window.confirm(confirmText)) return;
    try {
      await fn();
      await refresh();
    } catch (err) {
      onError(err instanceof Error ? err.message : "تعذر تنفيذ العملية");
    }
  }

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      onError("النسخ مش متاح في المتصفح ده. انسخ يدوي.");
    }
  }

  return (
    <section className="mt-6 app-card p-5 sm:p-6">
      <div className="flex items-start gap-3">
        <div className="grid size-10 shrink-0 place-items-center rounded-lg bg-teal/10 text-teal"><BadgeCheck className="size-5" /></div>
        <div>
          <h3 className="font-display text-xl font-semibold">تراخيص البرنامج المحلي</h3>
          <p className="mt-1 text-sm leading-6 text-muted">اعمل كود لكل عميل اشترى. العميل بيكتبه مرة واحدة (محتاج نت لأول تفعيل بس) وبعدها البرنامج بيشتغل عنده بدون إنترنت. كل كود مربوط بجهاز واحد بس (أول جهاز يفعّل بيه). لو غيّر الكمبيوتر حرّر جهازه القديم. بياناته كلها على جهازه، والمسجّل عندك بس اسم الجهاز وتاريخ التفعيل.</p>
        </div>
      </div>

      <form onSubmit={create} className="mt-5 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
        <div>
          <Label htmlFor="lic-note">اسم العميل (ملاحظة)</Label>
          <Input id="lic-note" value={note} maxLength={80} onChange={(e) => setNote(e.target.value)} placeholder="مثال: معمل النور - المنصورة" />
        </div>
        <Button type="submit" disabled={busy}>{busy ? <Loader2 className="animate-spin" /> : null} إنشاء كود</Button>
      </form>

      {code ? (
        <div className="mt-4 rounded-xl border border-teal/30 bg-teal/5 p-4 text-center">
          <p className="text-xs text-muted">الكود بيظهر مرة واحدة. انسخه أو ابعته دلوقتي.</p>
          <p dir="ltr" className="mt-2 select-all font-mono text-3xl font-bold tracking-[0.25em] text-teal">{code}</p>
          <div className="mt-3 flex flex-wrap justify-center gap-2">
            <Button size="sm" variant="outline" type="button" onClick={() => copy(code)}>{copied ? <Check /> : <Copy />} نسخ الكود</Button>
            <Button size="sm" variant="outline" asChild><a href={`https://wa.me/?text=${encodeURIComponent(`كود تفعيل البرنامج: ${code}`)}`} target="_blank" rel="noreferrer"><MessageCircle /> واتساب</a></Button>
            <Button size="sm" variant="ghost" type="button" onClick={() => setCode(null)}>تم</Button>
          </div>
        </div>
      ) : null}

      {rows && rows.length > 0 ? (
        <>
          <div className="mt-5 flex flex-wrap items-center gap-2">
            <div className="relative min-w-[12rem] flex-1">
              <Search className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
              <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="دوّر باسم العميل أو الجهاز" className="h-9 pr-9" aria-label="بحث في التراخيص" />
            </div>
            <div className="flex flex-wrap gap-1.5">
              {FILTERS.map((f) => {
                const n = f.id === "all" ? rows.length : rows.filter((l) => stateOf(l) === f.id).length;
                return (
                  <button key={f.id} type="button" onClick={() => setFilter(f.id)} aria-pressed={filter === f.id} className={`rounded-full border px-3 py-1 text-xs ${filter === f.id ? "border-teal bg-teal/10 text-teal" : "border-line text-muted"}`}>
                    {f.label} ({n})
                  </button>
                );
              })}
            </div>
          </div>
          {visible.length === 0 ? <p className="mt-4 text-center text-sm text-muted">مفيش نتائج.</p> : (
        <ul className="mt-3 divide-y divide-line rounded-lg border border-line">
          {visible.map((l) => {
            const live = liveDevices(l);
            return (
              <li key={l.id} className="space-y-2 px-4 py-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{l.note || "بدون ملاحظة"}</p>
                    <p className="text-xs text-muted">اتعمل {fmt(l.createdAt)} · {live.length ? "مربوط بجهاز" : "لسه ما اتربطش بجهاز"}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`rounded-full px-2.5 py-0.5 text-xs ${l.status === "active" ? (live.length ? "bg-ok/10 text-ok" : "bg-paper-2 text-ink-soft") : "bg-high/10 text-high"}`}>
                      {l.status === "revoked" ? "موقوف" : live.length ? "متفعّل" : "لسه ما اتفعّلش"}
                    </span>
                    {l.status === "active" ? (
                      <Button size="sm" variant="ghost" type="button" onClick={() => act(() => setLicenseStatus({ data: { id: l.id, status: "revoked" } }), "إيقاف الترخيص؟ البرنامج هيتقفل عند العميل أول ما جهازه يتصل بالنت. بياناته مش بتتمسح.")}>إيقاف</Button>
                    ) : (
                      <Button size="sm" variant="ghost" type="button" onClick={() => act(() => setLicenseStatus({ data: { id: l.id, status: "active" } }))}>إعادة تفعيل</Button>
                    )}
                  </div>
                </div>
                {live.map((d) => (
                  <div key={d.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-paper-2 px-3 py-2 text-xs">
                    <span className="flex items-center gap-2"><MonitorSmartphone className="size-4 text-muted" /> <span dir="ltr">{d.deviceName || "جهاز"}</span> · فُعّل {fmt(d.activatedAt)} · آخر ظهور {fmt(d.lastSeenAt)}</span>
                    <Button size="sm" variant="ghost" type="button" onClick={() => act(() => releaseLicenseDevice({ data: { id: d.id } }), "تحرير الجهاز؟ العميل يقدر يفعّل على جهاز جديد، والجهاز القديم هيتقفل أول ما يتصل بالنت.")}>تحرير الجهاز</Button>
                  </div>
                ))}
                {l.status === "active" && live.length === 0 ? <DeviceKeyForm license={l} onError={onError} onDone={() => void refresh()} /> : null}
              </li>
            );
          })}
        </ul>
          )}
        </>
      ) : null}
    </section>
  );
}
