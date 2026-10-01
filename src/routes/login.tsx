import { useState, type FormEvent } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  LockKeyhole,
  MessageCircle,
  Microscope,
  ShieldCheck,
  UserRound,
} from "lucide-react";

import { authClient } from "@/lib/auth/client";
import { getCurrentAccess } from "@/lib/lab-access";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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

  return (
    <main className="min-h-screen bg-paper px-4 py-8 sm:px-6">
      <div className="mx-auto grid min-h-[calc(100vh-4rem)] max-w-5xl items-center gap-8 lg:grid-cols-[1.1fr_0.9fr]">

        {/* التعريف بالنظام */}
        <section className="hidden rounded-2xl bg-ink p-10 text-paper lg:block">
          <div className="flex items-center gap-3">
            <span className="grid size-11 place-items-center rounded-xl bg-teal text-teal-fg">
              <Microscope className="size-5" />
            </span>

            <div>
              <p className="font-display text-xl font-semibold">
                Rajab Diagnostics
              </p>

              <p className="text-sm text-paper/55">
                Medical Laboratory System
              </p>
            </div>
          </div>

          <h1 className="mt-16 max-w-lg font-display text-4xl font-semibold leading-tight">
            لوحة تحكم مركزية لإدارة معامل التحاليل الطبية
          </h1>

          <p className="mt-5 max-w-lg text-sm leading-7 text-paper/65">
            نظام متكامل لإدارة المعامل والمستخدمين والتقارير والصلاحيات من
            مكان واحد.
          </p>
        </section>

        {/* كارت الدخول */}
        <section className="mx-auto w-full max-w-md rounded-2xl border border-line bg-elevated p-6 shadow-sm sm:p-8">

          <div className="mb-7 text-center">
            <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-xl bg-teal/10 text-teal">
              <ShieldCheck className="size-6" />
            </div>

            <h1 className="font-display text-2xl font-semibold">
              تسجيل الدخول
            </h1>

            <p className="mt-2 text-sm text-muted">
              اختر نوع الحساب للدخول إلى النظام
            </p>
          </div>

          {/* اختيار الحساب */}
          <div className="mb-6 grid grid-cols-2 gap-3">

            <button
              type="button"
              onClick={() => {
                setAccountType("admin");
                setLogin("");
                setPassword("");
                setError("");
              }}
              className={`rounded-xl border p-4 text-center transition-all ${
                isAdmin
                  ? "border-teal bg-teal/10 text-teal shadow-sm"
                  : "border-line bg-paper-2 text-muted hover:border-teal/40"
              }`}
            >
              <div
                className={`mx-auto mb-2 flex size-10 items-center justify-center rounded-full ${
                  isAdmin
                    ? "bg-teal text-teal-fg"
                    : "bg-ink/10 text-ink"
                }`}
              >
                <ShieldCheck className="size-5" />
              </div>

              <p className="font-semibold">المدير</p>

              <p className="mt-1 text-xs">
                إدارة النظام
              </p>
            </button>

            <button
              type="button"
              onClick={() => {
                setAccountType("user");
                setLogin("");
                setPassword("");
                setError("");
              }}
              className={`rounded-xl border p-4 text-center transition-all ${
                !isAdmin
                  ? "border-teal bg-teal/10 text-teal shadow-sm"
                  : "border-line bg-paper-2 text-muted hover:border-teal/40"
              }`}
            >
              <div
                className={`mx-auto mb-2 flex size-10 items-center justify-center rounded-full ${
                  !isAdmin
                    ? "bg-teal text-teal-fg"
                    : "bg-ink/10 text-ink"
                }`}
              >
                <UserRound className="size-5" />
              </div>

              <p className="font-semibold">المستخدم</p>

              <p className="mt-1 text-xs">
                إدارة المعمل
              </p>
            </button>

          </div>

          {/* نوع الحساب */}
          <div className="mb-5 rounded-lg bg-paper-2 px-3 py-2 text-center text-sm">
            {isAdmin ? (
              <span>
                👨‍💼 تسجيل دخول <strong>المدير</strong>
              </span>
            ) : (
              <span>
                🧑‍🔬 تسجيل دخول <strong>المستخدم</strong>
              </span>
            )}
          </div>

          {/* نموذج الدخول */}
          <form onSubmit={submit} className="space-y-4">

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
              <Label htmlFor="password">
                كلمة المرور
              </Label>

              <div className="relative">
                <LockKeyhole className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted" />

                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={8}
                  dir="ltr"
                  className="ps-9"
                  placeholder="••••••••"
                />
              </div>
            </div>

            {error ? (
              <p className="rounded-lg border border-high/20 bg-high/5 px-3 py-2 text-sm text-high">
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
            <div className="mt-6 rounded-xl border border-line bg-paper-2 p-4 text-center">

              <div className="mx-auto mb-2 flex size-10 items-center justify-center rounded-full bg-[#25D366]/10 text-[#25D366]">
                <MessageCircle className="size-5" />
              </div>

              <p className="text-sm font-medium">
                ليس لديك حساب؟
              </p>

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

        </section>
      </div>
    </main>
  );
}
