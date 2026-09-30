import { useEffect, useState, type ReactNode } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  ArrowLeft,
  BarChart3,
  FileText,
  FlaskConical,
  Loader2,
  Microscope,
  ShieldCheck,
  Users,
  WifiOff,
} from "lucide-react";

import { useCurrentUserState } from "@/lib/auth/gates";
import { getCurrentAccess } from "@/lib/lab-access";
import { useOnline } from "@/lib/offline/use-offline";
import { postLoginPath } from "@/lib/post-login-path";

export const Route = createFileRoute("/")({
  component: WelcomePage,
});

/**
 * Welcome page. It is what the installed app opens on, so it must not be a
 * toll booth: a signed-in user goes straight to their home, and there is no
 * artificial loading screen — only a real one while the session is resolved.
 */
function WelcomePage() {
  const navigate = useNavigate();
  const { user, isPending } = useCurrentUserState();
  const online = useOnline();
  const [routing, setRouting] = useState(false);

  useEffect(() => {
    if (isPending || !user) return;
    let cancelled = false;
    setRouting(true);
    getCurrentAccess()
      .then((access) => {
        if (cancelled) return;
        const to = postLoginPath(access);
        if (to) void navigate({ to, replace: true });
        else setRouting(false); // signed in but not linked to a lab/admin: show the welcome page
      })
      .catch(() => {
        if (!cancelled) setRouting(false); // offline or server error: show the welcome page
      });
    return () => {
      cancelled = true;
    };
  }, [isPending, user, navigate]);

  if (isPending || routing) return <Splash />;

  return (
    <Shell>
      <section className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center justify-center py-8 text-center">
        <span className="grid size-14 place-items-center rounded-2xl bg-white shadow-md ring-1 ring-slate-200">
          <Microscope className="size-7 text-teal-600" strokeWidth={1.6} />
        </span>

        <div dir="ltr" className="mt-5">
          <p className="text-xs font-medium tracking-wide text-slate-500">Powered by</p>
          <p className="mt-1 font-display text-xl font-bold text-slate-800 sm:text-2xl">Dr. Muhammad Ragab</p>
          <p className="mt-0.5 text-sm font-medium text-teal-700">Medical Laboratory Specialist</p>
        </div>

        <div className="mt-8">
          <p className="text-lg font-semibold text-slate-700 sm:text-2xl">ومرحبا بكم في</p>
          <h1 className="mt-1 font-display text-4xl font-bold tracking-tight text-slate-800 sm:text-6xl">
            Microscopic <span className="text-teal-600">System</span>
          </h1>
        </div>

        <p className="mx-auto mt-3 max-w-sm text-sm leading-7 text-slate-600 sm:text-base">
          إدارة معملية أكثر سهولة واحترافية
        </p>

        <ul className="mt-6 grid w-full max-w-md grid-cols-2 gap-2.5" aria-label="مميزات النظام">
          <Feature icon={<FileText />} label="تقارير دقيقة" />
          <Feature icon={<Users />} label="إدارة المرضى" />
          <Feature icon={<FlaskConical />} label="دليل التحاليل" />
          <Feature icon={<BarChart3 />} label="الإحصائيات" />
        </ul>

        <p className="mt-4 flex items-center gap-1.5 text-xs text-slate-600">
          <ShieldCheck className="size-4 text-teal-600" aria-hidden="true" />
          بيانات كل معمل منفصلة ولا تُفتح إلا بحساب خاص
        </p>

        {!online ? (
          <div
            role="status"
            className="mt-6 w-full max-w-sm rounded-2xl border border-amber-300 bg-amber-50 p-4 text-right text-sm leading-6 text-amber-900"
          >
            <p className="flex items-center gap-2 font-semibold">
              <WifiOff className="size-4" />
              أنت غير متصل بالإنترنت
            </p>
            <p className="mt-1">
              تسجيل الدخول يحتاج اتصالًا. لو فتحت صفحة "تقرير جديد" قبل كده وأنت متصل، تقدر تسجّل تقرير
              دلوقتي وهيتبعت لما الاتصال يرجع.
            </p>
            <Link
              to="/new"
              className="mt-3 flex h-11 items-center justify-center rounded-xl border border-amber-400 bg-white font-semibold"
            >
              إنشاء تقرير بدون إنترنت
            </Link>
          </div>
        ) : null}

        <Link
          to="/login"
          className="group mt-7 flex h-14 w-full max-w-sm items-center justify-center gap-3 rounded-2xl bg-teal-600 px-7 text-lg font-bold text-white shadow-lg shadow-teal-600/20 transition-all duration-200 hover:bg-teal-700 active:scale-[0.99]"
        >
          <span>ابدأ الآن</span>
          <span className="grid size-8 place-items-center rounded-full bg-white/15 transition-transform duration-200 group-hover:-translate-x-1">
            <ArrowLeft className="size-5" />
          </span>
        </Link>
      </section>
    </Shell>
  );
}

/** Real (not staged) loading: shown only while the session or destination is being resolved. */
function Splash() {
  return (
    <Shell centered>
      <div role="status" aria-live="polite" className="text-center">
        <span className="mx-auto grid size-20 place-items-center rounded-[1.5rem] bg-white shadow-xl ring-1 ring-slate-200">
          <Microscope className="size-10 text-teal-600" strokeWidth={1.3} />
        </span>
        <p className="mt-5 font-display text-2xl font-bold text-slate-800">
          Microscopic <span className="text-teal-600">System</span>
        </p>
        <p className="mt-3 flex items-center justify-center gap-2 text-sm text-slate-600">
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          جارٍ التحميل…
        </p>
      </div>
    </Shell>
  );
}

function Shell({ children, centered = false }: { children: ReactNode; centered?: boolean }) {
  return (
    <main dir="rtl" lang="ar" className="relative min-h-dvh overflow-hidden bg-slate-50">
      <div className="absolute inset-0 bg-gradient-to-br from-cyan-50 via-white to-teal-50" />
      <div className="pointer-events-none absolute -left-32 -top-32 size-96 rounded-full bg-teal-200/30 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-40 -right-32 size-[28rem] rounded-full bg-sky-200/30 blur-3xl" />

      <div
        className={`relative z-10 mx-auto flex min-h-dvh w-full max-w-3xl flex-col px-5 py-6 sm:px-8 ${
          centered ? "items-center justify-center" : ""
        }`}
      >
        {children}
      </div>
    </main>
  );
}

/** Informational only — deliberately not styled like a button. */
function Feature({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <li className="flex items-center gap-2.5 rounded-2xl bg-white/60 px-3 py-2.5 text-start ring-1 ring-slate-200/70">
      <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-teal-50 text-teal-700 [&_svg]:size-5">
        {icon}
      </span>
      <span className="text-[13px] font-semibold text-slate-700">{label}</span>
    </li>
  );
}
