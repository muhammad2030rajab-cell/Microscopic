import { useCallback, useEffect, useState } from "react";
import { useRouter } from "@tanstack/react-router";
import { Check, Copy, KeyRound, Loader2, MessageCircle, UserCheck, UserX } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  ASSIGNABLE_ROLES,
  ROLE_LABELS,
  decideJoinRequest,
  getJoinOverview,
  listJoinRequests,
  setJoinCode,
  type JoinOverview,
  type JoinRequestRow,
} from "@/lib/lab-users";
import { JOIN_DEFAULT_ROLE } from "@/lib/join-requests";

/**
 * "كود الانضمام": the manager switches the join code on, shares it, and answers each request here.
 * The code is shown once, right after it is made (only its hash is stored).
 */
export function JoinRequestsPanel({ onError }: { onError: (message: string | null) => void }) {
  const router = useRouter();
  const [overview, setOverview] = useState<JoinOverview | null>(null);
  const [requests, setRequests] = useState<JoinRequestRow[]>([]);
  const [roles, setRoles] = useState<Record<string, string>>({});
  const [code, setCode] = useState<string | null>(null);
  const [copied, setCopied] = useState<"code" | "link" | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [o, r] = await Promise.all([getJoinOverview(), listJoinRequests()]);
      setOverview(o);
      setRequests(r);
    } catch {
      /* offline or not allowed: the panel just stays quiet */
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const link = typeof window === "undefined" ? "" : `${window.location.origin}/join`;

  async function run(key: string, action: () => Promise<void>) {
    if (!navigator.onLine) return onError("ده محتاج اتصال بالإنترنت.");
    setBusy(key);
    onError(null);
    try {
      await action();
    } catch (e) {
      onError(e instanceof Error && /[\u0600-\u06FF]/.test(e.message) ? e.message : "تعذر تنفيذ الطلب. جرّب تاني");
    } finally {
      setBusy(null);
    }
  }

  const generate = () =>
    run("code", async () => {
      if (overview?.enabled && !window.confirm("كود جديد هيوقّف الكود القديم فورًا. تكمل؟")) return;
      const res = await setJoinCode({ data: { action: "generate" } });
      setCode(res.code);
      setOverview((o) => ({ pending: o?.pending ?? 0, enabled: true }));
    });

  const disable = () =>
    run("code", async () => {
      if (!window.confirm("إيقاف الانضمام بالكود؟ محدش هيقدر يطلب انضمام لحد ما تعمل كود جديد.")) return;
      await setJoinCode({ data: { action: "disable" } });
      setCode(null);
      setOverview((o) => ({ pending: o?.pending ?? 0, enabled: false }));
    });

  const decide = (row: JoinRequestRow, approve: boolean) =>
    run(row.id, async () => {
      if (!approve && !window.confirm(`رفض طلب ${row.name || row.username}؟ الحساب هيتحذف.`)) return;
      await decideJoinRequest({ data: { id: row.id, approve, role: roles[row.id] ?? JOIN_DEFAULT_ROLE } });
      setRequests((list) => list.filter((r) => r.id !== row.id));
      setOverview((o) => (o ? { ...o, pending: Math.max(0, o.pending - 1) } : o));
      if (approve) await router.invalidate(); // the new person now shows in the team list
    });

  async function copy(kind: "code" | "link", text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(kind);
      setTimeout(() => setCopied(null), 1800);
    } catch {
      onError("النسخ مش متاح في المتصفح ده. انسخ الكود يدوي.");
    }
  }

  if (!overview) return null;

  const whatsapp = code ? `https://wa.me/?text=${encodeURIComponent(`انضم لفريق المعمل:\n${link}\nكود الانضمام: ${code}`)}` : "";

  return (
    <section className="mt-6 rounded-xl border border-line bg-elevated p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="grid size-10 place-items-center rounded-lg bg-teal/10 text-teal">
            <KeyRound className="size-5" />
          </div>
          <div>
            <h3 className="font-display text-xl font-semibold">
              كود الانضمام
              {overview.pending > 0 ? <span className="mr-2 rounded-full bg-high px-2 py-0.5 align-middle text-xs font-bold text-white">{overview.pending} جديد</span> : null}
            </h3>
            <p className="text-sm text-muted">{overview.enabled ? "الانضمام شغّال: اللي معاه الكود يقدر يبعت طلب، وانت بتوافق." : "الانضمام مقفول. اعمل كود ليبعت الناس طلبات."}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button size="sm" onClick={generate} disabled={busy === "code"}>
            {busy === "code" ? <Loader2 className="animate-spin" /> : null} {overview.enabled ? "كود جديد" : "تفعيل الانضمام"}
          </Button>
          {overview.enabled ? (
            <Button size="sm" variant="outline" onClick={disable} disabled={busy === "code"}>
              إيقاف
            </Button>
          ) : null}
        </div>
      </div>

      {code ? (
        <div className="mt-4 rounded-xl border border-teal/30 bg-teal/5 p-4 text-center">
          <p className="text-xs text-muted">الكود بيظهر مرة واحدة. انسخه أو ابعته دلوقتي.</p>
          <p dir="ltr" className="mt-2 select-all font-mono text-3xl font-bold tracking-[0.25em] text-teal">
            {code}
          </p>
          <div className="mt-3 flex flex-wrap justify-center gap-2">
            <Button size="sm" variant="outline" onClick={() => copy("code", code)}>
              {copied === "code" ? <Check /> : <Copy />} نسخ الكود
            </Button>
            <Button size="sm" variant="outline" onClick={() => copy("link", link)}>
              {copied === "link" ? <Check /> : <Copy />} نسخ رابط الانضمام
            </Button>
            <a href={whatsapp} target="_blank" rel="noreferrer" className="inline-flex h-8 items-center gap-2 rounded-md border border-line px-3 text-sm hover:bg-paper">
              <MessageCircle className="size-4" /> واتساب
            </a>
          </div>
        </div>
      ) : null}

      <div className="mt-5">
        <p className="mb-2 text-sm font-medium">طلبات مستنية ({requests.length})</p>
        {requests.length === 0 ? <p className="rounded-xl border border-dashed border-line p-4 text-center text-sm text-muted">مفيش طلبات دلوقتي.</p> : null}
        <div className="space-y-2">
          {requests.map((row) => (
            <div key={row.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line p-3">
              <div className="min-w-0">
                <p className="truncate font-medium">{row.name || row.username}</p>
                <p dir="ltr" className="text-left text-xs text-muted">
                  @{row.username}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <select
                  aria-label="الدور"
                  value={roles[row.id] ?? JOIN_DEFAULT_ROLE}
                  onChange={(e) => setRoles((r) => ({ ...r, [row.id]: e.target.value }))}
                  className="h-9 rounded-md border border-line bg-paper px-2 text-sm"
                  disabled={busy === row.id}
                >
                  {ASSIGNABLE_ROLES.map((r) => (
                    <option key={r} value={r}>
                      {ROLE_LABELS[r]}
                    </option>
                  ))}
                </select>
                <Button size="sm" onClick={() => decide(row, true)} disabled={busy === row.id}>
                  {busy === row.id ? <Loader2 className="animate-spin" /> : <UserCheck />} موافقة
                </Button>
                <Button size="sm" variant="outline" onClick={() => decide(row, false)} disabled={busy === row.id}>
                  <UserX /> رفض
                </Button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
