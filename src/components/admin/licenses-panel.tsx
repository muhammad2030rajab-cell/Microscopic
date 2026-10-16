import { useCallback, useEffect, useState, type FormEvent } from "react";
import { BadgeCheck, Check, Copy, Loader2, MessageCircle, MonitorSmartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createLicense, listLicenses, releaseLicenseDevice, setLicenseStatus, type LicenseRow } from "@/lib/license-admin";

const selectCls = "flex h-11 w-full rounded-sm border border-line bg-elevated px-3 text-sm";
const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("ar-EG") : "—");

/** Licenses for the local program: make a code per sale, see which device activated it, revoke or free a device. */
export function LicensesPanel({ onError }: { onError: (message: string | null) => void }) {
  const [rows, setRows] = useState<LicenseRow[] | null>(null);
  const [note, setNote] = useState("");
  const [maxDevices, setMaxDevices] = useState("1");
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

  async function create(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    onError(null);
    try {
      const res = await createLicense({ data: { note, maxDevices: Number(maxDevices) } });
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
          <p className="mt-1 text-sm leading-6 text-muted">اعمل كود لكل عميل اشترى. العميل بيكتبه مرة واحدة (محتاج نت لأول تفعيل بس) وبعدها البرنامج بيشتغل عنده بدون إنترنت. الكود بيتفعّل على عدد الأجهزة اللي تحدده. بياناته كلها على جهازه، والمسجّل عندك بس اسم الجهاز وتاريخ التفعيل.</p>
        </div>
      </div>

      <form onSubmit={create} className="mt-5 grid gap-3 sm:grid-cols-[1.6fr_1fr_auto] sm:items-end">
        <div>
          <Label htmlFor="lic-note">اسم العميل (ملاحظة)</Label>
          <Input id="lic-note" value={note} maxLength={80} onChange={(e) => setNote(e.target.value)} placeholder="مثال: معمل النور - المنصورة" />
        </div>
        <div>
          <Label htmlFor="lic-devices">عدد الأجهزة المسموحة</Label>
          <select id="lic-devices" value={maxDevices} onChange={(e) => setMaxDevices(e.target.value)} className={selectCls}>
            {["1", "2", "3", "5"].map((n) => <option key={n} value={n}>{n === "1" ? "جهاز واحد" : `${n} أجهزة`}</option>)}
          </select>
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
        <ul className="mt-5 divide-y divide-line rounded-lg border border-line">
          {rows.map((l) => {
            const live = l.devices.filter((d) => !d.released);
            return (
              <li key={l.id} className="space-y-2 px-4 py-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{l.note || "بدون ملاحظة"}</p>
                    <p className="text-xs text-muted">اتعمل {fmt(l.createdAt)} · {live.length} من {l.maxDevices} أجهزة</p>
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
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}
