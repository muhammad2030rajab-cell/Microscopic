import { useState, type FormEvent } from "react";
import { createFileRoute, Link, Navigate, useNavigate } from "@tanstack/react-router";
import { UserPlus } from "lucide-react";
import { authClient } from "@/lib/auth/client";
import { claimFirstPlatformAdmin, deleteSelfIfOrphaned, platformAdminExists } from "@/lib/platform-admin";
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
    try {
      return { adminExists: await platformAdminExists() };
    } catch {
      return { adminExists: false };
    }
  },
  component: AdminSetup,
});

function AdminSetup() {
  const { adminExists } = Route.useLoaderData();
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
    const claimed = await claimFirstPlatformAdmin();
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
