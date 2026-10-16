import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Check, Copy, KeyRound, Loader2, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createLabInvite, listLabInvites, revokeLabInvite, type LabInviteRow } from "@/lib/lab-invites";
import type { InviteStatus } from "@/lib/lab-invite-input";

const STATUS_LABEL: Record<InviteStatus, { text: string; cls: string }> = {
  active: { text: "شغّال", cls: "bg-ok/10 text-ok" },
  used_up: { text: "اتستخدم", cls: "bg-paper-2 text-ink-soft" },
  expired: { text: "انتهى", cls: "bg-paper-2 text-ink-soft" },
  revoked: { text: "ملغي", cls: "bg-high/10 text-high" },
};

const selectCls = "flex h-11 w-full rounded-sm border border-line bg-elevated px-3 text-sm";

/**
 * Invitation codes: make a code, hand it over, and the new lab owner creates their own lab and login on /join.
 * The code is shown once (only its hash is stored).
 */
export function LabInvitesPanel({ onError }: { onError: (message: string | null) => void }) {
  const [invites, setInvites] = useState<LabInviteRow[] | null>(null);
  const [label, setLabel] = useState("");
  const [maxUses, setMaxUses] = useState("1");
  const [days, setDays] = useState("30");
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState<string | null>(null);
  const [copied, setCopied] = useState<"code" | "link" | null>(null);

  const refresh = useCallback(async () => {
    try {
      setInvites(await listLabInvites());
    } catch {
      setInvites([]);
    }
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh]);

  const link = typeof window !== "undefined" ? `${window.location.origin}/join` : "/join";

  async function create(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    onError(null);
    try {
      const res = await createLabInvite({ data: { label, maxUses: Number(maxUses), expiresInDays: days === "none" ? null : Number(days) } });
      setCode(res.code);
      setLabel("");
      await refresh();
    } catch (err) {
      onError(err instanceof Error ? err.message : "تعذر إنشاء الكود");
    } finally {
      setBusy(false);
    }
  }

  async function revoke(id: string) {
    if (!window.confirm("إلغاء الكود؟ اللي معاه الكود مش هيقدر يستخدمه، والمعامل اللي اتعملت بيه هتفضل زي ما هي.")) return;
    try {
      await revokeLabInvite({ data: { id } });
      await refresh();
    } catch (err) {
      onError(err instanceof Error ? err.message : "تعذر إلغاء الكود");
    }
  }

  async function copy(kind: "code" | "link", text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(kind);
      setTimeout(() => setCopied(null), 1800);
    } catch {
      onError("النسخ مش متاح في المتصفح ده. انسخ يدوي.");
    }
  }

  const whatsapp = code ? `https://wa.me/?text=${encodeURIComponent(`أنشئ معملك على المنصة:\n${link}\nكود الدعوة: ${code}`)}` : "";

  return (
    <section className="mt-6 app-card p-5 sm:p-6">
      <div className="flex items-start gap-3">
        <div className="grid size-10 shrink-0 place-items-center rounded-lg bg-teal/10 text-teal"><KeyRound className="size-5" /></div>
        <div>
          <h3 className="font-display text-xl font-semibold">كود دعوة معمل جديد</h3>
          <p className="mt-1 text-sm leading-6 text-muted">اعمل كود وابعته لصاحب المعمل. بيفتح صفحة <span dir="ltr" className="font-mono">/join</span>، يكتب الكود، وينشئ معمله وحسابه بنفسه، من غير ما تعمل له حساب.</p>
        </div>
      </div>

      <form onSubmit={create} className="mt-5 grid gap-3 sm:grid-cols-[1.4fr_1fr_1fr_auto] sm:items-end">
        <div>
          <Label htmlFor="inv-label">لمين الكود؟ (ملاحظة، اختياري)</Label>
          <Input id="inv-label" value={label} maxLength={60} onChange={(e) => setLabel(e.target.value)} placeholder="مثال: معمل النور - المنصورة" />
        </div>
        <div>
          <Label htmlFor="inv-uses">عدد مرات الاستخدام</Label>
          <select id="inv-uses" value={maxUses} onChange={(e) => setMaxUses(e.target.value)} className={selectCls}>
            {["1", "2", "5", "10", "25"].map((n) => <option key={n} value={n}>{n === "1" ? "مرة واحدة" : `${n} مرات`}</option>)}
          </select>
        </div>
        <div>
          <Label htmlFor="inv-days">صلاحية الكود</Label>
          <select id="inv-days" value={days} onChange={(e) => setDays(e.target.value)} className={selectCls}>
            <option value="7">7 أيام</option>
            <option value="30">30 يوم</option>
            <option value="90">90 يوم</option>
            <option value="none">بدون انتهاء</option>
          </select>
        </div>
        <Button type="submit" disabled={busy}>{busy ? <Loader2 className="animate-spin" /> : null} إنشاء كود</Button>
      </form>

      {code ? (
        <div className="mt-4 rounded-xl border border-teal/30 bg-teal/5 p-4 text-center">
          <p className="text-xs text-muted">الكود بيظهر مرة واحدة. انسخه أو ابعته دلوقتي.</p>
          <p dir="ltr" className="mt-2 select-all font-mono text-3xl font-bold tracking-[0.25em] text-teal">{code}</p>
          <div className="mt-3 flex flex-wrap justify-center gap-2">
            <Button size="sm" variant="outline" type="button" onClick={() => copy("code", code)}>{copied === "code" ? <Check /> : <Copy />} نسخ الكود</Button>
            <Button size="sm" variant="outline" type="button" onClick={() => copy("link", link)}>{copied === "link" ? <Check /> : <Copy />} نسخ الرابط</Button>
            <Button size="sm" variant="outline" asChild><a href={whatsapp} target="_blank" rel="noreferrer"><MessageCircle /> واتساب</a></Button>
            <Button size="sm" variant="ghost" type="button" onClick={() => setCode(null)}>تم</Button>
          </div>
        </div>
      ) : null}

      {invites && invites.length > 0 ? (
        <ul className="mt-5 divide-y divide-line rounded-lg border border-line">
          {invites.map((i) => (
            <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
              <div className="min-w-0">
                <p className="truncate font-medium">{i.label || "بدون ملاحظة"}</p>
                <p className="text-xs text-muted">
                  استُخدم {i.uses} من {i.maxUses}
                  {i.expiresAt ? ` · ينتهي ${new Date(i.expiresAt).toLocaleDateString("ar-EG")}` : " · بدون انتهاء"}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className={`rounded-full px-2.5 py-0.5 text-xs ${STATUS_LABEL[i.status].cls}`}>{STATUS_LABEL[i.status].text}</span>
                {i.status === "active" ? <Button size="sm" variant="ghost" type="button" onClick={() => revoke(i.id)}>إلغاء</Button> : null}
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
