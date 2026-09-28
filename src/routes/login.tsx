import { useState, type FormEvent } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Eye, EyeOff, LockKeyhole, MessageCircle } from "lucide-react";

import { authClient } from "@/lib/auth/client";
import { getCurrentAccess } from "@/lib/lab-access";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FieldOfView } from "@/components/brand/field-of-view";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/login")({
  component: Login,
});

type AccountType = "admin" | "user";

const WHATSAPP_NUMBER = "201120660398";

const WHATSAPP_MESSAGE = `السلام عليكم د. محمد رجب 👋
أرغب في إنشاء حساب على Microscopic System.

اسم المعمل:
اسم المسؤول:
رقم الهاتف:

شكرًا لكم.`;

function Login() {
  const navigate = useNavigate();

  const [accountType, setAccountType] = useState<AccountType>("admin");
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const isAdmin = accountType === "admin";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setError("");
    setLoading(true);

    const value = login.trim();

    const email = isAdmin
      ? value
      : `${value.toLowerCase()}@lab.local`;

    const result = await authClient.signIn.email({
      email,
      password,
    });

    setLoading(false);

    if (result.error) {
      setError(result.error.message ?? "بيانات الدخول غير صحيحة");
      return;
    }

    const access = await getCurrentAccess();

    if (access.type === "admin") {
      await navigate({ to: "/admin" });
      return;
    }

    if (access.type === "lab") {
      await navigate({ to: "/lab" });
      return;
    }

    await authClient.signOut();

    setError("الحساب غير مرتبط بمدير أو بمعمل نشط.");
  }

  const whatsappUrl =
    `https://wa.me/${WHATSAPP_NUMBER}?text=` +
    encodeURIComponent(WHATSAPP_MESSAGE);

  function selectType(type: AccountType) {
    setAccountType(type);
    setLogin("");
    setPassword("");
    setError("");
  }

  return (
    <main className="min-h-screen bg-paper px-4 py-8 sm:px-6">
      <div className="mx-auto grid min-h-[calc(100vh-4rem)] max-w-5xl items-center gap-8 lg:grid-cols-[1.1fr_0.9fr]">
        {/* التعريف بالنظام */}
        <section className="hidden min-h-[34rem] flex-col justify-between rounded-2xl bg-ink p-10 text-paper lg:flex">
          <p className="font-display text-xl font-semibold" dir="ltr">
            Microscopic System
          </p>

          <FieldOfView className="mx-auto my-8 h-auto w-64" />

          <div>
            <h1 className="max-w-md font-display text-3xl font-semibold leading-tight">
              لوحة تحكم لمعملك وفريقك
            </h1>

            <p className="mt-3 max-w-md text-sm leading-7 text-paper/65">
              المرضى والتقارير والصلاحيات في مكان واحد.
            </p>
          </div>
        </section>

        {/* كارت الدخول */}
        <section className="mx-auto w-full max-w-md">
          <div className="mb-6 flex items-center gap-3 lg:hidden">
            <FieldOfView className="size-12 shrink-0" />
            <p className="font-display text-lg font-semibold" dir="ltr">
              Microscopic System
            </p>
          </div>

          <div className="rounded-2xl border border-line bg-elevated p-6 shadow-sm sm:p-8">
            <h2 className="font-display text-2xl font-semibold">
              تسجيل الدخول
            </h2>

            <div
              role="tablist"
              aria-label="نوع الحساب"
              className="mt-6 grid grid-cols-2 rounded-lg bg-paper-2 p-1"
            >
              {(
                [
                  ["admin", "المدير"],
                  ["user", "المستخدم"],
                ] as const
              ).map(([type, label]) => (
                <button
                  key={type}
                  type="button"
                  role="tab"
                  aria-selected={accountType === type}
                  onClick={() => selectType(type)}
                  className={cn(
                    "h-10 rounded-md text-sm font-semibold transition-colors",
                    accountType === type
                      ? "bg-elevated text-ink shadow-sm"
                      : "text-muted hover:text-ink",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>

            <p className="mt-3 text-sm text-muted">
              {isAdmin
                ? "إدارة المنصة والمعامل"
                : "الدخول إلى حساب معملك"}
            </p>

            {/* نموذج الدخول */}
            <form onSubmit={submit} className="mt-6 space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="login">
                  {isAdmin
                    ? "البريد الإلكتروني للمدير"
                    : "اسم المستخدم"}
                </Label>

                <Input
                  id="login"
                  type={isAdmin ? "email" : "text"}
                  autoComplete="username"
                  value={login}
                  onChange={(e) => setLogin(e.target.value)}
                  required
                  dir="ltr"
                  placeholder={
                    isAdmin
                      ? "admin@example.com"
                      : "lab_username"
                  }
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="password">كلمة المرور</Label>

                <div className="relative">
                  <LockKeyhole className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted" />

                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={8}
                    dir="ltr"
                    className="px-9"
                    placeholder="••••••••"
                  />

                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"}
                    className="absolute end-2 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-md text-muted transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {showPassword ? (
                      <EyeOff className="size-4" />
                    ) : (
                      <Eye className="size-4" />
                    )}
                  </button>
                </div>
              </div>

              {error ? (
                <p
                  role="alert"
                  className="rounded-lg border border-high/20 bg-high/5 px-3 py-2 text-sm text-high"
                >
                  {error}
                </p>
              ) : null}

              <Button
                type="submit"
                size="lg"
                className="w-full"
                disabled={loading}
              >
                {loading
                  ? "جارٍ تسجيل الدخول…"
                  : isAdmin
                    ? "دخول المدير"
                    : "دخول المستخدم"}
              </Button>
            </form>

            {/* طلب حساب - للمستخدم فقط */}
            {!isAdmin ? (
              <div className="mt-6 border-t border-line pt-5 text-center">
                <p className="text-sm font-medium">ليس لديك حساب؟</p>

                <p className="mt-1 text-xs text-muted">
                  تواصل معنا لطلب إنشاء حساب للمعمل
                </p>

                <a
                  href={whatsappUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-3 inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-[#25D366] px-4 text-sm font-semibold text-white transition-opacity hover:opacity-90"
                >
                  <MessageCircle className="size-4" />
                  طلب إنشاء حساب عبر WhatsApp
                </a>
              </div>
            ) : null}
          </div>
        </section>
      </div>
    </main>
  );
}
