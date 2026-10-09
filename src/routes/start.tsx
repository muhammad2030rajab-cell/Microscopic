import { useState, type FormEvent } from "react";
import { createFileRoute, Navigate, redirect, useNavigate } from "@tanstack/react-router";
import { CircleAlert, KeyRound, Loader2, LockKeyhole, Microscope, UserRound } from "lucide-react";
import { authClient } from "@/lib/auth/client";
import { activateLicense } from "@/lib/license";
import { licenseErrorMessage } from "@/lib/license-messages";
import { getLocalSetupState, setupLocalLab } from "@/lib/local-setup";
import { PASSWORD_HINT, passwordPolicyError } from "@/lib/password-policy";
import { DeviceIdBlock } from "@/components/device-id-block";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/start")({
  ssr: false,
  loader: async () => {
    const state = await getLocalSetupState().catch(() => null);
    // Only the lab's own program: until the lab has been created, or while the program is locked (new computer / Windows).
    const locked = state?.license.required === true && !state.license.activated;
    if (!state || !state.hub || (!state.needsSetup && !locked)) throw redirect({ to: "/login" });
    return state;
  },
  component: StartPage,
});

const FIELD = "h-12 rounded-xl border-slate-200 bg-white focus-visible:border-blue-500 focus-visible:ring-blue-500/40";

function StartPage() {
  const state = Route.useLoaderData();
  const navigate = useNavigate();
  const [needsCode, setNeedsCode] = useState(state.license.required && !state.license.activated);
  // The lab already exists: this screen is only here to enter a new activation key.
  const reactivateOnly = !state.needsSetup;
  const [code, setCode] = useState("");
  const [labName, setLabName] = useState("");
  const [doctorName, setDoctorName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  if (!state.hub) return <Navigate to="/login" replace />;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (reactivateOnly) {
      setLoading(true);
      try {
        await activateLicense({ data: { code: code.trim() } });
        void navigate({ to: "/login", replace: true });
      } catch (err) {
        setError(licenseErrorMessage(err));
      } finally {
        setLoading(false);
      }
      return;
    }
    const policy = passwordPolicyError(password);
    if (policy) {
      setError(policy);
      return;
    }
    setLoading(true);
    try {
      if (needsCode) {
        await activateLicense({ data: { code: code.trim() } });
        setNeedsCode(false);
      }
      await setupLocalLab({ data: { name: labName, username, password, doctorName } });
      const signIn = await authClient.signIn.email({ email: `${username.trim().toLowerCase()}@lab.local`, password });
      if (signIn.error) {
        void navigate({ to: "/login", replace: true });
        return;
      }
      void navigate({ to: "/lab", replace: true });
    } catch (err) {
      setError(licenseErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main dir="rtl" className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-slate-50 px-5 py-10">
      <div className="absolute inset-0 bg-gradient-to-br from-sky-100/70 via-white to-blue-100/70" />
      <div className="relative z-10 w-full max-w-md">
        <div className="text-center">
          <div className="mx-auto grid size-16 place-items-center rounded-2xl bg-gradient-to-br from-blue-500 to-slate-900 shadow-lg shadow-blue-900/20">
            <Microscope className="size-8 text-white" strokeWidth={1.75} />
          </div>
          <h1 className="mt-5 text-4xl font-bold tracking-tight text-slate-800" dir="ltr">
            Microscopic
          </h1>
          <p className="mt-2 text-sm text-slate-500">أهلًا بيك! خطوة واحدة ويبقى المعمل جاهز.</p>
        </div>

        <section className="mt-8 rounded-3xl bg-white/80 p-6 shadow-xl shadow-blue-900/5 ring-1 ring-slate-200/70 backdrop-blur sm:p-8">
          <h2 className="text-2xl font-bold text-slate-800">{reactivateOnly ? "تفعيل البرنامج" : "تجهيز المعمل"}</h2>
          <p className="mt-1 text-sm leading-6 text-slate-500">{reactivateOnly ? "الكود الحالي متصدّر لجهاز تاني (غالبًا بعد تغيير الويندوز أو الكمبيوتر). ابعت رقم الجهاز للمطوّر عشان يرسل لك كود جديد. بياناتك سليمة ومحفوظة." : "البيانات دي بتتحفظ على الجهاز ده بس."}</p>

          <form onSubmit={submit} className="mt-6 space-y-4">
            {needsCode && state.license.deviceId ? <DeviceIdBlock deviceId={state.license.deviceId} /> : null}
            {needsCode ? (
              <div className="space-y-1.5">
                <Label htmlFor="code" className="text-slate-700">كود التفعيل</Label>
                <div className="relative">
                  <KeyRound className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                  <Input id="code" dir="ltr" required value={code} onChange={(e) => setCode(e.target.value)} placeholder="الصق كود التفعيل هنا" className={`${FIELD} pl-10`} />
                </div>
                <p className="text-xs text-slate-500">ابعت رقم الجهاز للمطوّر واستلم الكود، والصقه هنا. مرة واحدة وبدون إنترنت.</p>
              </div>
            ) : null}

            {reactivateOnly ? null : <>
            <div className="space-y-1.5">
              <Label htmlFor="lab" className="text-slate-700">اسم المعمل</Label>
              <Input id="lab" required value={labName} onChange={(e) => setLabName(e.target.value)} className={FIELD} />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="doctor" className="text-slate-700">اسم الدكتور (اختياري)</Label>
              <Input id="doctor" value={doctorName} onChange={(e) => setDoctorName(e.target.value)} className={FIELD} />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="user" className="text-slate-700">اسم المستخدم (إنجليزي)</Label>
              <div className="relative">
                <UserRound className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                <Input id="user" dir="ltr" required autoCapitalize="none" autoCorrect="off" spellCheck={false} value={username} onChange={(e) => setUsername(e.target.value)} placeholder="lab_owner" className={`${FIELD} pl-10`} />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="pw" className="text-slate-700">كلمة المرور</Label>
              <div className="relative">
                <LockKeyhole className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                <Input id="pw" type="password" dir="ltr" required value={password} onChange={(e) => setPassword(e.target.value)} className={`${FIELD} pl-10`} />
              </div>
              <p className="text-xs text-slate-500">{PASSWORD_HINT}</p>
            </div>
            </>}

            {error ? (
              <p role="alert" className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                <CircleAlert className="mt-0.5 size-4 shrink-0" />
                {error}
              </p>
            ) : null}

            <Button type="submit" disabled={loading} className="h-12 w-full rounded-xl text-base">
              {loading ? <Loader2 className="size-5 animate-spin" /> : reactivateOnly ? "تفعيل" : "ابدأ"}
            </Button>
          </form>
        </section>
      </div>
    </main>
  );
}
