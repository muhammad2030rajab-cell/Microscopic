import { useEffect, useState, type FormEvent, type KeyboardEvent } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  ArrowLeft,
  CircleAlert,
  Eye,
  EyeOff,
  Loader2,
  LockKeyhole,
  MessageCircle,
  Microscope,
  ShieldCheck,
  UserRound,
} from "lucide-react";

import { authClient } from "@/lib/auth/client";
import { useCurrentUserState } from "@/lib/auth/gates";
import { accountExists } from "@/lib/account-check";
import { getCurrentAccess } from "@/lib/lab-access";
import { getPublicPlatformSettings, DEFAULT_SUPPORT_WHATSAPP } from "@/lib/platform-settings";
import { postLoginPath } from "@/lib/post-login-path";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/login")({
  loader: async () => {
    try {
      const s = await getPublicPlatformSettings();
      return { supportWhatsapp: s.supportWhatsapp, supportEmail: s.supportEmail, websiteUrl: s.websiteUrl, supportText: s.supportText };
    } catch {
      return { supportWhatsapp: DEFAULT_SUPPORT_WHATSAPP, supportEmail: "", websiteUrl: "", supportText: "" };
    }
  },
  component: Login,
});

/** يفشل الطلب لو اتأخر أكتر من المدة، بدل ما الزرار يفضل يلف للأبد. */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err: unknown) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

type AccountType = "admin" | "user";

const ACCOUNT_TYPE_KEY = "microscopic:login-account-type";

const ACCOUNT_TYPES: Array<{
  value: AccountType;
  label: string;
  icon: typeof ShieldCheck;
}> = [
  { value: "user", label: "حساب معمل", icon: UserRound },
  { value: "admin", label: "حساب المدير", icon: ShieldCheck },
];

const FIELD_CLASS =
  "h-12 rounded-xl border-slate-200 bg-white focus-visible:border-teal-500 focus-visible:ring-teal-500/40";

function Login() {
  const navigate = useNavigate();
  const { supportWhatsapp, supportEmail, websiteUrl, supportText } = Route.useLoaderData();
  // رابط واتساب مباشر بدون أي رسالة جاهزة (الرقم من إعدادات المنصة)
  const CONTACT_URL = `https://wa.me/${supportWhatsapp}`;

  const [accountType, setAccountType] = useState<AccountType>("user");
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [suspended, setSuspended] = useState(false);

  const isAdmin = accountType === "admin";

  // لو المستخدم مسجّل دخول بالفعل (مثلاً رجع بزر الرجوع) ما نعرضلوش الفورم تاني
  const { user, isPending } = useCurrentUserState();
  useEffect(() => {
    if (isPending || !user) return;
    let cancelled = false;
    getCurrentAccess()
      .then(async (access) => {
        if (cancelled) return;
        if (access.type === "suspended") {
          // الحساب اتوقف وهو داخل: نطلّعه ونعرض رسالة التواصل مع المدير
          await authClient.signOut().catch(() => undefined);
          if (!cancelled) setSuspended(true);
          return;
        }
        const to = postLoginPath(access);
        if (to) void navigate({ to, replace: true });
      })
      .catch(() => {
        /* أوفلاين أو خطأ سيرفر: نسيب الفورم ظاهرة */
      });
    return () => {
      cancelled = true;
    };
  }, [isPending, user, navigate]);

  // تذكّر نوع الحساب الأخير عشان المستخدم ما يختارش كل مرة
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(ACCOUNT_TYPE_KEY);
      if (saved === "admin" || saved === "user") setAccountType(saved);
    } catch {
      /* التخزين غير متاح — نكمل بالافتراضي */
    }
  }, []);

  function chooseType(next: AccountType) {
    if (next === accountType) return;
    setAccountType(next);
    setLogin("");
    setPassword("");
    setShowPassword(false);
    setError("");
    try {
      window.localStorage.setItem(ACCOUNT_TYPE_KEY, next);
    } catch {
      /* تجاهل */
    }
  }

  function trackCapsLock(event: KeyboardEvent<HTMLInputElement>) {
    setCapsLock(event.getModifierState("CapsLock"));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setError("");
    setSuspended(false);
    setLoading(true);

    try {
      const value = login.trim();

      const email = isAdmin ? value : `${value.toLowerCase()}@lab.local`;

      const result = await withTimeout(
        authClient.signIn.email({
          email,
          password,
        }),
        20_000,
      );

      if (result.error) {
        const badCredentials =
          result.error.status === 401 || result.error.code === "INVALID_EMAIL_OR_PASSWORD";
        if (badCredentials) {
          // نفرّق بين "لا يوجد حساب" و"كلمة المرور غير صحيحة"
          const exists = await withTimeout(accountExists({ data: { email } }), 10_000).catch(
            () => null,
          );
          if (exists === false) {
            setError(
              isAdmin
                ? "لا يوجد حساب بهذا البريد الإلكتروني."
                : "لا يوجد حساب بهذا الاسم.",
            );
          } else if (exists === true) {
            setError("كلمة المرور غير صحيحة.");
          } else {
            setError("بيانات الدخول غير صحيحة.");
          }
          return;
        }
        setError(result.error.message ?? "بيانات الدخول غير صحيحة");
        return;
      }

      const access = await withTimeout(getCurrentAccess(), 20_000);

      if (access.type === "suspended") {
        await authClient.signOut();
        setSuspended(true);
        return;
      }

      const destination = postLoginPath(access);
      if (destination) {
        await navigate({ to: destination, replace: true });
        return;
      }

      await authClient.signOut();

      setError("الحساب غير مرتبط بمدير أو بمعمل نشط.");
    } catch {
      // انقطاع نت أو سيرفر بطيء: نفك التعليقة ونسيب المستخدم يعيد المحاولة
      setError("تعذّر الاتصال بالسيرفر. تأكد من الإنترنت وجرّب تاني.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main
      dir="rtl"
      className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-slate-50 px-5 py-10"
    >
      {/* خلفية ناعمة بنفس روح صفحة الترحيب */}
      <div className="absolute inset-0 bg-gradient-to-br from-cyan-100/70 via-white to-sky-100/70" />
      <div className="pointer-events-none absolute -left-32 -top-32 size-96 rounded-full bg-teal-200/40 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-40 -right-32 size-[28rem] rounded-full bg-sky-200/40 blur-3xl" />

      <div className="relative z-10 w-full max-w-md">
        {/* الهوية */}
        <div className="text-center">
          <div className="mx-auto grid size-16 place-items-center rounded-2xl bg-white shadow-lg shadow-teal-900/10 ring-1 ring-slate-200/70">
            <Microscope className="size-8 text-teal-600" strokeWidth={1.75} />
          </div>

          <h1 className="mt-5 font-display text-4xl font-bold tracking-tight text-slate-800">
            Microscopic <span className="text-teal-600">System</span>
          </h1>

          <p className="mt-2 text-sm text-slate-500">
            إدارة معملية أكثر سهولة واحترافية
          </p>
        </div>

        {/* بطاقة الدخول */}
        <section className="mt-8 rounded-3xl bg-white/80 p-6 shadow-xl shadow-teal-900/5 ring-1 ring-slate-200/70 backdrop-blur duration-500 animate-in fade-in slide-in-from-bottom-2 sm:p-8">
          <h2 className="font-display text-2xl font-bold text-slate-800">
            تسجيل الدخول
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            اختر نوع حسابك ثم أدخل بياناتك.
          </p>

          {/* اختيار نوع الحساب */}
          <div
            role="radiogroup"
            aria-label="نوع الحساب"
            className="mt-5 grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1"
          >
            {ACCOUNT_TYPES.map(({ value, label, icon: Icon }) => {
              const active = accountType === value;
              return (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => chooseType(value)}
                  className={`flex h-11 items-center justify-center gap-2 rounded-lg text-sm font-semibold transition-[background-color,color,box-shadow] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 ${
                    active
                      ? "bg-white text-teal-700 shadow-sm"
                      : "text-slate-500 hover:text-slate-700"
                  }`}
                >
                  <Icon className="size-4 shrink-0" />
                  {label}
                </button>
              );
            })}
          </div>

          <form onSubmit={submit} className="mt-6 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="login" className="text-slate-700">
                {isAdmin ? "البريد الإلكتروني" : "اسم المستخدم"}
              </Label>

              <Input
                id="login"
                type={isAdmin ? "email" : "text"}
                autoComplete="username"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                value={login}
                onChange={(e) => setLogin(e.target.value)}
                required
                dir="ltr"
                placeholder={isAdmin ? "admin@example.com" : "lab_username"}
                className={FIELD_CLASS}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="password" className="text-slate-700">
                كلمة المرور
              </Label>

              <div className="relative">
                <LockKeyhole className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-slate-400" />

                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={trackCapsLock}
                  onKeyUp={trackCapsLock}
                  onBlur={() => setCapsLock(false)}
                  required
                  minLength={8}
                  dir="ltr"
                  placeholder="••••••••"
                  className={`${FIELD_CLASS} pl-10 pr-12`}
                />

                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={
                    showPassword ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"
                  }
                  aria-pressed={showPassword}
                  className="absolute right-1.5 top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-lg text-slate-400 transition-colors hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500"
                >
                  {showPassword ? (
                    <EyeOff className="size-4" />
                  ) : (
                    <Eye className="size-4" />
                  )}
                </button>
              </div>

              {capsLock ? (
                <p className="text-xs text-amber-700">
                  زر Caps Lock مفعّل، وكلمة المرور حساسة لحالة الأحرف.
                </p>
              ) : null}
            </div>

            <div aria-live="polite" className="space-y-3">
              {suspended ? (
                <div
                  role="alert"
                  className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-900"
                >
                  <p className="flex items-start gap-2 font-semibold">
                    <CircleAlert className="mt-0.5 size-4 shrink-0" />
                    <span>تم إيقاف هذا الحساب. برجاء التواصل مع المدير.</span>
                  </p>
                  <a
                    href={CONTACT_URL}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-3 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-[#25D366]/40 bg-[#25D366]/10 px-4 text-sm font-semibold text-[#128C7E] transition-colors hover:bg-[#25D366]/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500"
                  >
                    <MessageCircle className="size-4" />
                    تواصل معي عبر WhatsApp
                  </a>
                </div>
              ) : null}
              {error ? (
                <p
                  role="alert"
                  className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700"
                >
                  <CircleAlert className="mt-0.5 size-4 shrink-0" />
                  <span>{error}</span>
                </p>
              ) : null}
            </div>

            <Button
              type="submit"
              size="lg"
              disabled={loading}
              className="h-14 w-full rounded-2xl bg-teal-600 text-base font-bold text-white shadow-lg shadow-teal-600/25 hover:bg-teal-700 focus-visible:ring-teal-500"
            >
              {loading ? (
                <>
                  <Loader2 className="animate-spin" />
                  جارٍ تسجيل الدخول…
                </>
              ) : (
                <>
                  تسجيل الدخول
                  <span className="grid size-8 place-items-center rounded-full bg-white/20">
                    <ArrowLeft className="size-4" />
                  </span>
                </>
              )}
            </Button>
          </form>

          {/* طلب حساب — للمعامل فقط */}
          {!isAdmin ? (
            <div className="mt-6 border-t border-slate-200/80 pt-5">
              <p className="text-sm font-medium text-slate-700">
                معملك ليس لديه حساب؟
              </p>

              <a
                href={CONTACT_URL}
                target="_blank"
                rel="noreferrer"
                className="mt-3 inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-[#25D366]/40 bg-[#25D366]/10 px-4 text-sm font-semibold text-[#128C7E] transition-colors hover:bg-[#25D366]/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500"
              >
                <MessageCircle className="size-4" />
                اطلب حساب عبر WhatsApp
              </a>

              {supportText ? <p className="mt-3 text-center text-xs leading-6 text-slate-500">{supportText}</p> : null}
              {supportEmail || websiteUrl ? (
                <p className="mt-2 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-slate-600">
                  {supportEmail ? <a href={`mailto:${supportEmail}`} dir="ltr" className="hover:underline">{supportEmail}</a> : null}
                  {websiteUrl ? <a href={websiteUrl} target="_blank" rel="noreferrer" dir="ltr" className="hover:underline">{websiteUrl.replace(/^https?:\/\//, "").replace(/\/$/, "")}</a> : null}
                </p>
              ) : null}
            </div>
          ) : null}
        </section>

        {/* خصوصية */}
        <p className="mt-5 flex items-center justify-center gap-2 text-center text-xs text-slate-500">
          <ShieldCheck className="size-4 shrink-0 text-teal-600" />
          بيانات كل معمل منفصلة ولا تُفتح إلا بحساب خاص
        </p>

        {/* التوقيع */}
        <div className="mt-8 text-center">
          <p className="text-xs text-slate-400">Powered by</p>
          <p className="mt-0.5 font-display text-base font-bold text-slate-800">
            Dr. Muhammad Ragab
          </p>
          <p className="text-xs font-medium text-teal-700">
            Medical Laboratory Specialist
          </p>
        </div>
      </div>
    </main>
  );
}
