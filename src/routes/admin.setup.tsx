import { useState, type FormEvent } from "react";
import { createFileRoute, Link, Navigate, useNavigate } from "@tanstack/react-router";
import { KeyRound, UserPlus } from "lucide-react";
import { authClient } from "@/lib/auth/client";
import { claimFirstPlatformAdmin, deleteSelfIfOrphaned, platformAdminExists } from "@/lib/platform-admin";
import { activateLicense, getLicenseStatus, licenseErrorMessage } from "@/lib/license";
import { PASSWORD_HINT, PASSWORD_MIN_LENGTH, passwordPolicyError } from "@/lib/password-policy";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/admin/setup")({
  // Close the bootstrap page once a platform admin exists — it previously
  // stayed open forever (see AGENTS note in `admin.tsx`), letting anyone
  // reach a real account-creation form indefinitely. A public existence
  // check is safe here: it reveals nothing beyond "has this ever been set up".
  loader: async () => {
    const license = await getLicenseStatus().catch(() => ({ required: false, activated: true, machineId: "" }));
    try {
      return { adminExists: await platformAdminExists(), license };
    } catch {
      return { adminExists: false, license };
    }
  },
  component: AdminSetup,
});

function AdminSetup() {
  const { adminExists, license } = Route.useLoaderData();
  const [activated, setActivated] = useState(license.activated);
  const [code, setCode] = useState("");
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    // Better Auth's own signUpEmail only enforces its default 8-plain-
    // character minimum (no complexity rule, no shared config with the rest
    // of the app — see the "do not edit" note in auth/server.ts). This is
    // the ONE account-creation path in the app that does not also go through
    // `createLab`/`createLabStaff`'s server-side `passwordPolicyError` check,
    // so — for the platform's single most-privileged account — enforce the
    // same rule here before ever calling signUp.
    const policyError = passwordPolicyError(password);
    if (policyError) {
      setError(policyError);
      return;
    }
    setLoading(true);
    const signUp = await authClient.signUp.email({ name: name.trim(), email: email.trim(), password });
    if (signUp.error) {
      setLoading(false);
      setError(signUp.error.message ?? "تعذر إنشاء الحساب");
      return;
    }
    let claimed = false;
    try {
      claimed = await claimFirstPlatformAdmin();
    } catch (err) {
      // Not activated (or the check failed): do not leave a stray account behind.
      await deleteSelfIfOrphaned().catch(() => undefined);
      await authClient.signOut();
      setLoading(false);
      setError(licenseErrorMessage(err));
      return;
    }
    if (!claimed) {
      // Lost the race: someone else claimed the first-admin slot between our
      // page load and this submit. `signUp.email` above already created a
      // real, signed-in account that will never hold any role — clean it up
      // instead of leaving a permanent orphan, then sign out.
      await deleteSelfIfOrphaned().catch(() => undefined);
      await authClient.signOut();
      setLoading(false);
      setError("تم إنشاء حساب مدير آخر قبل حسابك. الرجاء تسجيل الدخول بحساب ذلك المدير.");
      return;
    }
    setLoading(false);
    await navigate({ to: "/admin" });
  }

  if (adminExists) return <Navigate to="/login" replace />;

  async function activate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      await activateLicense({ data: { code } });
      setActivated(true);
    } catch (err) {
      setError(licenseErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  if (license.required && !activated) {
    return (
      <main className="grid min-h-screen place-items-center bg-paper px-4 py-8">
        <section className="w-full max-w-md rounded-2xl border border-line bg-elevated p-6 shadow-sm sm:p-8">
          <div className="mb-7">
            <div className="mb-4 grid size-12 place-items-center rounded-xl bg-teal/10 text-teal"><KeyRound className="size-6" /></div>
            <h1 className="font-display text-2xl font-semibold">تفعيل البرنامج</h1>
            <p className="mt-2 text-sm leading-6 text-muted">اكتب رقم التسجيل اللي استلمته من البائع. محتاج إنترنت مرة واحدة بس للتفعيل، وبعدها البرنامج بيشتغل من غير نت وكل بياناتك بتفضل عندك. لو مفيش نت، ابعت «رقم الجهاز» اللي تحت للبائع واكتب الكود اللي يبعتهولك.</p>
          </div>
          <div className="mb-5 rounded-lg border border-line bg-paper p-3">
            <p className="text-xs text-muted">رقم هذا الجهاز</p>
            <p dir="ltr" className="mt-1 select-all font-mono text-lg tracking-wider">{license.machineId || "غير متاح، اتواصل مع البائع"}</p>
          </div>
          <form onSubmit={activate} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="license-code">رقم التسجيل (أو كود التفعيل)</Label>
              <textarea
                id="license-code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                required
                rows={3}
                dir="ltr"
                spellCheck={false}
                autoCapitalize="characters"
                placeholder="RJB-XXXX-XXXX-XXXX-XXXX"
                className="w-full resize-none rounded-sm border border-line bg-elevated px-3 py-2 font-mono text-sm tracking-wide"
              />
              <p className="text-xs text-muted">الأفضل تلزقه (Paste) كامل بدل ما تكتبه.</p>
            </div>
            {error ? <p className="rounded-lg border border-high/20 bg-high/5 px-3 py-2 text-sm text-high">{error}</p> : null}
            <Button type="submit" size="lg" className="w-full" disabled={loading || code.trim().length < 20}>{loading ? "جارٍ التحقق…" : "تفعيل"}</Button>
          </form>
        </section>
      </main>
    );
  }

  return (
    <main className="grid min-h-screen place-items-center bg-paper px-4 py-8">
      <section className="w-full max-w-md rounded-2xl border border-line bg-elevated p-6 shadow-sm sm:p-8">
        <div className="mb-7">
          <div className="mb-4 grid size-12 place-items-center rounded-xl bg-teal/10 text-teal"><UserPlus className="size-6" /></div>
          <h1 className="font-display text-2xl font-semibold">إنشاء حساب المدير الأول</h1>
          <p className="mt-2 text-sm leading-6 text-muted">استخدم هذه الصفحة أثناء إعداد النظام. أول حساب ناجح يحصل على صلاحية المدير المركزي.</p>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5"><Label htmlFor="name">اسم المدير</Label><Input id="name" value={name} onChange={(e) => setName(e.target.value)} required /></div>
          <div className="space-y-1.5"><Label htmlFor="email">البريد الإلكتروني</Label><Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required dir="ltr" /></div>
          <div className="space-y-1.5">
            <Label htmlFor="password">كلمة المرور</Label>
            <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={PASSWORD_MIN_LENGTH} dir="ltr" />
            <p className="text-xs text-muted">{PASSWORD_HINT}</p>
          </div>
          {error ? <p className="rounded-lg border border-high/20 bg-high/5 px-3 py-2 text-sm text-high">{error}</p> : null}
          <Button type="submit" size="lg" className="w-full" disabled={loading}>{loading ? "جارٍ إنشاء الحساب…" : "إنشاء المدير"}</Button>
        </form>
        <p className="mt-5 text-center text-sm text-muted">لديك حساب بالفعل؟ <Link to="/login" className="text-teal hover:underline">تسجيل الدخول</Link></p>
      </section>
    </main>
  );
}
