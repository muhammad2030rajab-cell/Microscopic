import { useEffect, useRef, useState, type FormEvent } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowRight, Check, CircleAlert, Clock, KeyRound, Loader2, Microscope, ShieldCheck } from "lucide-react";
import { authClient } from "@/lib/auth/client";
import { checkJoinCode, requestLabAccess } from "@/lib/lab-join";
import { checkLabInviteCode, createLabWithInvite } from "@/lib/lab-invites";
import { inviteErrorMessage } from "@/lib/lab-invite-input";
import { JOIN_CODE_LENGTH, joinErrorMessage } from "@/lib/join-requests";
import { normalizeNumerals } from "@/lib/numerals";
import { PASSWORD_MIN_LENGTH } from "@/lib/password-policy";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/join")({
  component: JoinPage,
});

type Step = "code" | "details" | "done";

const cleanCode = (value: string) => normalizeNumerals(value).toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, JOIN_CODE_LENGTH);

function JoinPage() {
  const [step, setStep] = useState<Step>("code");
  const [code, setCode] = useState("");
  const [labName, setLabName] = useState("");
  // "lab" = a manager's join code (staff request); "invite" = a platform invitation (create your own lab).
  const [kind, setKind] = useState<"lab" | "invite">("lab");
  const [newLabName, setNewLabName] = useState("");
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [shake, setShake] = useState(0);
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const codeInput = useRef<HTMLInputElement>(null);

  // The code is checked the moment the last character is typed or pasted: no button to find.
  useEffect(() => {
    if (step !== "code" || code.length !== JOIN_CODE_LENGTH || busy) return;
    let cancelled = false;
    setBusy(true);
    setError(null);
    const message = (e: unknown) => (e instanceof Error ? e.message : "");
    const fail = (e: unknown) => {
      if (cancelled) return;
      setError(/INVITE_/.test(message(e)) ? inviteErrorMessage(e) : joinErrorMessage(e));
      setShake((n) => n + 1);
      setCode("");
      codeInput.current?.focus();
    };
    // A manager's join code first; if it is not one, try a platform invitation code.
    checkJoinCode({ data: { code } })
      .then((res) => {
        if (cancelled) return;
        setKind("lab");
        setLabName(res.labName);
        setStep("details");
      })
      .catch(async (e) => {
        if (cancelled) return;
        if (!/JOIN_CODE_INVALID/.test(message(e))) return fail(e);
        try {
          await checkLabInviteCode({ data: { code } });
          if (cancelled) return;
          setKind("invite");
          setStep("details");
        } catch (e2) {
          fail(/INVITE_CODE_INVALID/.test(message(e2)) ? e : e2);
        }
      })
      .finally(() => !cancelled && setBusy(false));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, step]);

  const rules = [
    { ok: password.length >= PASSWORD_MIN_LENGTH, label: `${PASSWORD_MIN_LENGTH} أحرف+` },
    { ok: /[a-zA-Z]/.test(password), label: "حروف" },
    { ok: /[0-9]/.test(password), label: "أرقام" },
  ];
  const strength = rules.filter((r) => r.ok).length + (password.length >= 14 || /[^a-zA-Z0-9]/.test(password) ? 1 : 0);
  const usernameOk = /^[a-z0-9._-]{3,40}$/.test(username);
  const matches = confirm.length > 0 && confirm === password;
  const canSend = usernameOk && rules.every((r) => r.ok) && matches && !busy && (kind === "lab" || newLabName.trim().length >= 2);

  async function send(e: FormEvent) {
    e.preventDefault();
    if (!canSend) return;
    setBusy(true);
    setError(null);
    try {
      if (kind === "invite") {
        await createLabWithInvite({ data: { code, labName: newLabName, ownerName: name, username, password } });
        // The lab is ready: sign the new owner in and go to the lab's first-time setup.
        const signedIn = await authClient.signIn.email({ email: `${username}@lab.local`, password }).then((r) => !r?.error).catch(() => false);
        if (signedIn) {
          await navigate({ to: "/lab", replace: true });
          return;
        }
        setStep("done");
        return;
      }
      await requestLabAccess({ data: { code, username, name, password } });
      // Creating the login may have signed this browser in as the new (powerless) account: end that session.
      await authClient.signOut().catch(() => undefined);
      setStep("done");
    } catch (err) {
      setError(kind === "invite" ? inviteErrorMessage(err) : joinErrorMessage(err));
      if (/CODE|ATTEMPTS/.test(err instanceof Error ? err.message : "")) {
        setStep("code");
        setCode("");
      }
    } finally {
      setBusy(false);
    }
  }

  const stepIndex = step === "code" ? 0 : step === "details" ? 1 : 2;

  return (
    <main dir="rtl" className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-slate-50 px-5 py-10">
      <style>{`
        @keyframes join-shake { 0%,100% { transform: translateX(0) } 20% { transform: translateX(-9px) } 40% { transform: translateX(9px) } 60% { transform: translateX(-6px) } 80% { transform: translateX(6px) } }
        @keyframes join-pop { 0% { transform: scale(.4); opacity: 0 } 60% { transform: scale(1.12); opacity: 1 } 100% { transform: scale(1) } }
        @keyframes join-pulse { 0%,100% { box-shadow: 0 0 0 0 rgba(13,148,136,.45) } 50% { box-shadow: 0 0 0 9px rgba(13,148,136,0) } }
        @media (prefers-reduced-motion: reduce) { .join-anim { animation: none !important } }
      `}</style>
      <div className="absolute inset-0 bg-gradient-to-br from-cyan-100/70 via-white to-sky-100/70" />
      <div className="pointer-events-none absolute -left-32 -top-32 size-96 rounded-full bg-blue-200/40 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-40 -right-32 size-[28rem] rounded-full bg-sky-200/40 blur-3xl" />

      <div className="relative z-10 w-full max-w-md">
        <div className="text-center">
          <div className="mx-auto grid size-16 place-items-center rounded-2xl bg-white shadow-lg shadow-blue-900/10 ring-1 ring-slate-200/70">
            <Microscope className="size-8 text-blue-600" strokeWidth={1.75} />
          </div>
          <h1 className="mt-5 font-display text-3xl font-bold tracking-tight text-slate-800">{kind === "invite" && step !== "code" ? "أنشئ معملك" : "انضم لفريق المعمل"}</h1>
          <p className="mt-2 text-sm text-slate-500">{kind === "invite" && step !== "code" ? "خطوتين ومعملك وحسابك يبقوا جاهزين" : "خطوتين وطلبك يوصل لمدير المعمل"}</p>
        </div>

        {/* خطوات التقدم */}
        <ol className="mt-6 flex items-center justify-center gap-2" aria-label="خطوات الانضمام">
          {["الكود", "بياناتك", "تم"].map((label, i) => (
            <li key={label} className="flex items-center gap-2">
              <span
                className={`grid size-7 place-items-center rounded-full text-xs font-bold transition-colors ${
                  i < stepIndex ? "bg-blue-600 text-white" : i === stepIndex ? "bg-blue-100 text-blue-800 ring-2 ring-blue-500" : "bg-slate-200 text-slate-500"
                }`}
              >
                {i < stepIndex ? <Check className="size-4" /> : i + 1}
              </span>
              <span className={`text-xs ${i === stepIndex ? "font-semibold text-slate-800" : "text-slate-500"}`}>{label}</span>
              {i < 2 ? <span className="mx-1 h-px w-6 bg-slate-300" /> : null}
            </li>
          ))}
        </ol>

        <section className="mt-6 rounded-3xl bg-white/80 p-6 shadow-xl shadow-blue-900/5 ring-1 ring-slate-200/70 backdrop-blur">
          {step === "code" ? (
            <div>
              <h2 className="flex items-center gap-2 font-display text-xl font-bold text-slate-800">
                <KeyRound className="size-5 text-blue-600" /> اكتب كود الانضمام
              </h2>
              <p className="mt-1 text-sm text-slate-500">الكود اللي وصلك من مدير المعمل أو من إدارة المنصة (10 حروف وأرقام).</p>

              <div key={shake} className="join-anim relative mt-6" style={shake ? { animation: "join-shake .45s" } : undefined} dir="ltr">
                <div className="flex items-center justify-center gap-1.5" aria-hidden>
                  {Array.from({ length: JOIN_CODE_LENGTH }, (_, i) => (
                    <span key={i} className="contents">
                      {i === 5 ? <span className="mx-1 text-slate-400">-</span> : null}
                      <span
                        className={`grid h-12 w-8 place-items-center rounded-lg border-2 font-mono text-lg font-bold transition-colors sm:w-9 ${
                          code[i] ? "border-blue-500 bg-blue-50 text-blue-800" : i === code.length ? "border-blue-400 bg-white" : "border-slate-200 bg-white"
                        }`}
                      >
                        {code[i] ?? ""}
                      </span>
                    </span>
                  ))}
                </div>
                <input
                  ref={codeInput}
                  autoFocus
                  value={code}
                  onChange={(e) => {
                    setError(null);
                    setCode(cleanCode(e.target.value));
                  }}
                  disabled={busy}
                  aria-label="كود الانضمام"
                  autoComplete="off"
                  autoCapitalize="characters"
                  spellCheck={false}
                  className="absolute inset-0 h-full w-full cursor-text opacity-0"
                />
              </div>

              <div aria-live="polite" className="mt-5 min-h-6 text-center text-sm">
                {busy ? (
                  <span className="inline-flex items-center gap-2 text-slate-500">
                    <Loader2 className="size-4 animate-spin" /> بتأكد من الكود…
                  </span>
                ) : null}
                {error ? (
                  <span role="alert" className="inline-flex items-center gap-2 text-red-700">
                    <CircleAlert className="size-4" /> {error}
                  </span>
                ) : null}
              </div>
            </div>
          ) : null}

          {step === "details" ? (
            <form onSubmit={send} className="space-y-4">
              <div className="flex items-center gap-2 rounded-xl bg-blue-50 px-3 py-2.5 text-sm text-blue-900 ring-1 ring-blue-200">
                <ShieldCheck className="size-5 shrink-0 text-blue-600" />
                <span>
                  {kind === "invite" ? <>كود الدعوة تمام. اكتب بيانات معملك وحسابك.</> : <>هتنضم إلى: <strong>{labName}</strong></>}
                </span>
              </div>

              {kind === "invite" ? (
                <div className="space-y-1.5">
                  <Label htmlFor="join-lab">اسم المعمل</Label>
                  <Input id="join-lab" value={newLabName} maxLength={80} onChange={(e) => setNewLabName(e.target.value)} placeholder="مثال: معمل النور للتحاليل" autoComplete="organization" />
                </div>
              ) : null}

              <div className="space-y-1.5">
                <Label htmlFor="join-name">{kind === "invite" ? "اسمك (صاحب المعمل)" : "اسمك"}</Label>
                <Input id="join-name" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} placeholder="مثال: أحمد علي" autoComplete="name" />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="join-username">اسم المستخدم (إنجليزي)</Label>
                <Input
                  id="join-username"
                  dir="ltr"
                  className="text-left"
                  value={username}
                  maxLength={40}
                  onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/\s/g, ""))}
                  placeholder="ahmed.ali"
                  autoComplete="username"
                  autoCapitalize="none"
                />
                {username && !usernameOk ? <p className="text-xs text-red-700">3-40 حرف إنجليزي أو أرقام أو ._-</p> : null}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="join-password">كلمة المرور</Label>
                <Input id="join-password" type="password" dir="ltr" className="text-left" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
                <div className="flex items-center gap-2" aria-hidden>
                  {[0, 1, 2, 3].map((i) => (
                    <span key={i} className={`h-1.5 flex-1 rounded-full transition-colors ${i < strength ? (strength >= 4 ? "bg-emerald-500" : strength >= 3 ? "bg-blue-500" : "bg-amber-400") : "bg-slate-200"}`} />
                  ))}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {rules.map((r) => (
                    <span key={r.label} className={`rounded-full px-2 py-0.5 text-xs ${r.ok ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                      {r.ok ? "✓ " : ""}
                      {r.label}
                    </span>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="join-confirm">تأكيد كلمة المرور</Label>
                <Input id="join-confirm" type="password" dir="ltr" className="text-left" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />
                {confirm && !matches ? <p className="text-xs text-red-700">كلمتين المرور مش متطابقين</p> : null}
              </div>

              <div aria-live="polite">
                {error ? (
                  <p role="alert" className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">
                    <CircleAlert className="mt-0.5 size-4 shrink-0" /> <span>{error}</span>
                  </p>
                ) : null}
              </div>

              <Button
                type="submit"
                size="lg"
                disabled={!canSend}
                className="h-14 w-full rounded-2xl bg-blue-600 text-base font-bold text-white shadow-lg shadow-blue-600/25 hover:bg-blue-700 focus-visible:ring-blue-500"
              >
                {busy ? (
                  <>
                    <Loader2 className="animate-spin" /> {kind === "invite" ? "جاري إنشاء المعمل…" : "جاري الإرسال…"}
                  </>
                ) : (
                  kind === "invite" ? "إنشاء المعمل والدخول" : "إرسال طلب الانضمام"
                )}
              </Button>
              <button type="button" onClick={() => { setStep("code"); setCode(""); setError(null); }} className="flex w-full items-center justify-center gap-1 text-sm text-slate-500 hover:text-slate-700">
                <ArrowRight className="size-4" /> رجوع لكتابة الكود
              </button>
            </form>
          ) : null}

          {step === "done" && kind === "invite" ? (
            <div className="text-center">
              <div className="join-anim mx-auto grid size-20 place-items-center rounded-full bg-blue-600 text-white shadow-lg shadow-blue-600/30" style={{ animation: "join-pop .55s ease-out both" }}>
                <Check className="size-10" strokeWidth={3} />
              </div>
              <h2 className="mt-5 font-display text-2xl font-bold text-slate-800">معملك جاهز</h2>
              <p className="mt-1 text-sm text-slate-500">سجّل دخول باسم المستخدم وكلمة المرور اللي كتبتهم.</p>
              <p className="mt-6 rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-600" dir="rtl">
                اسم المستخدم بتاعك: <strong dir="ltr">{username}</strong>
              </p>
              <Link to="/login" className="mt-5 inline-flex h-12 w-full items-center justify-center rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-blue-700">
                تسجيل الدخول
              </Link>
            </div>
          ) : null}

          {step === "done" && kind === "lab" ? (
            <div className="text-center">
              <div className="join-anim mx-auto grid size-20 place-items-center rounded-full bg-blue-600 text-white shadow-lg shadow-blue-600/30" style={{ animation: "join-pop .55s ease-out both" }}>
                <Check className="size-10" strokeWidth={3} />
              </div>
              <h2 className="mt-5 font-display text-2xl font-bold text-slate-800">طلبك وصل</h2>
              <p className="mt-1 text-sm text-slate-500">
                مدير <strong>{labName}</strong> هيراجعه ويوافق عليه.
              </p>
              <ul className="mx-auto mt-6 max-w-xs space-y-3 text-right text-sm">
                <li className="flex items-center gap-3 text-slate-800">
                  <span className="grid size-6 place-items-center rounded-full bg-blue-600 text-white"><Check className="size-4" /></span> اتبعت الطلب
                </li>
                <li className="flex items-center gap-3 font-semibold text-slate-800">
                  <span className="join-anim grid size-6 place-items-center rounded-full bg-blue-100 text-blue-700" style={{ animation: "join-pulse 1.8s infinite" }}><Clock className="size-4" /></span> مستني موافقة المدير
                </li>
                <li className="flex items-center gap-3 text-slate-400">
                  <span className="grid size-6 place-items-center rounded-full bg-slate-200"><span className="size-1.5 rounded-full bg-slate-400" /></span> تدخل بحسابك
                </li>
              </ul>
              <p className="mt-6 rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-600" dir="rtl">
                اسم المستخدم بتاعك: <strong dir="ltr">{username}</strong>
              </p>
              <Link to="/login" className="mt-5 inline-flex h-12 w-full items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50">
                رجوع لتسجيل الدخول
              </Link>
            </div>
          ) : null}
        </section>

        {step !== "done" ? (
          <p className="mt-5 text-center text-sm text-slate-500">
            عندك حساب؟{" "}
            <Link to="/login" className="font-semibold text-blue-700 hover:underline">
              سجّل دخول
            </Link>
          </p>
        ) : null}
      </div>
    </main>
  );
}
