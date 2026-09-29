import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import {
  ArrowLeft,
  BarChart3,
  FileText,
  FlaskConical,
  Microscope,
  ShieldCheck,
  Users,
} from "lucide-react";

export const Route = createFileRoute("/")({
  component: WelcomePage,
});

function WelcomePage() {
  const navigate = useNavigate();

  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (!loading) return;

    const interval = window.setInterval(() => {
      setProgress((current) => Math.min(current + 3, 100));
    }, 50);

    const redirectTimer = window.setTimeout(() => {
      navigate({ to: "/login" });
    }, 1700);

    return () => {
      window.clearInterval(interval);
      window.clearTimeout(redirectTimer);
    };
  }, [loading, navigate]);

  if (loading) {
    return (
      <main
        dir="rtl"
        className="relative flex min-h-screen items-center justify-center overflow-hidden bg-slate-50 px-5"
      >
        <div className="absolute inset-0 bg-gradient-to-br from-cyan-50 via-white to-teal-50" />

        <div className="pointer-events-none absolute -left-32 -top-32 size-96 rounded-full bg-teal-200/30 blur-3xl" />

        <div className="pointer-events-none absolute -bottom-40 -right-32 size-[28rem] rounded-full bg-sky-200/30 blur-3xl" />

        <div className="relative z-10 w-full max-w-md text-center">
          <div className="relative mx-auto w-fit">
            <div className="absolute inset-0 rounded-[2rem] bg-teal-300/25 blur-2xl" />

            <div className="relative grid size-28 place-items-center rounded-[2rem] bg-white shadow-xl ring-1 ring-slate-200 sm:size-32">
              <div className="grid size-20 place-items-center rounded-[1.5rem] bg-gradient-to-br from-teal-50 to-cyan-50 sm:size-24">
                <Microscope
                  className="size-12 text-teal-600 sm:size-14"
                  strokeWidth={1.25}
                />
              </div>
            </div>
          </div>

          <h1 className="mt-7 font-display text-4xl font-bold tracking-tight text-slate-800">
            Microscopic
          </h1>

          <p className="mt-1 text-xs font-semibold tracking-[0.28em] text-teal-600">
            SYSTEM
          </p>

          <h2 className="mt-10 text-xl font-bold text-slate-800">
            جاري التحميل...
          </h2>

          <p className="mt-2 text-sm text-slate-500">
            يتم تجهيز النظام، برجاء الانتظار
          </p>

          <div className="mx-auto mt-8 h-3 w-full overflow-hidden rounded-full bg-slate-200">
            <div
              className="h-full rounded-full bg-teal-600 transition-all duration-100"
              style={{ width: `${Math.min(progress, 100)}%` }}
            />
          </div>

          <p className="mt-3 text-sm font-bold text-teal-600">
            {Math.min(Math.round(progress), 100)}%
          </p>

          <div className="mt-10 grid grid-cols-3 gap-3">
            <LoadingItem
              icon={<ShieldCheck />}
              label="أمان البيانات"
            />

            <LoadingItem
              icon={<FlaskConical />}
              label="تجهيز النظام"
            />

            <LoadingItem
              icon={<FileText />}
              label="التقارير"
            />
          </div>
        </div>
      </main>
    );
  }

  return (
    <main
      dir="rtl"
      className="relative min-h-screen overflow-hidden bg-slate-50"
    >
      <div className="absolute inset-0 bg-gradient-to-br from-cyan-50 via-white to-teal-50" />

      <div className="pointer-events-none absolute -left-32 -top-32 size-96 rounded-full bg-teal-200/30 blur-3xl" />

      <div className="pointer-events-none absolute -bottom-40 -right-32 size-[28rem] rounded-full bg-sky-200/30 blur-3xl" />

      <div className="pointer-events-none absolute left-1/2 top-1/2 size-96 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/60 blur-3xl" />

      <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-6xl flex-col px-5 py-7 sm:px-8 lg:px-12">
        <header className="flex items-center justify-between">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-slate-400 sm:text-xs">
              Medical Laboratory
            </p>

            <p className="mt-1 text-sm font-bold text-slate-700">
              Microscopic
            </p>
          </div>

          <div className="grid size-11 place-items-center rounded-2xl bg-white shadow-md ring-1 ring-slate-200">
            <Microscope
              className="size-6 text-teal-600"
              strokeWidth={1.7}
            />
          </div>
        </header>

        <section className="mx-auto flex w-full max-w-4xl flex-1 flex-col items-center justify-center py-8 text-center">
          <div className="relative">
            <div className="absolute inset-0 rounded-[2rem] bg-teal-300/20 blur-2xl" />

            <div className="relative grid size-32 place-items-center rounded-[2rem] bg-white shadow-xl ring-1 ring-slate-200 sm:size-40">
              <div className="grid size-24 place-items-center rounded-[1.5rem] bg-gradient-to-br from-teal-50 to-cyan-50">
                <Microscope
                  className="size-14 text-teal-600 sm:size-20"
                  strokeWidth={1.25}
                />
              </div>
            </div>
          </div>

          <h1 className="mt-7 font-display text-4xl font-bold tracking-tight text-slate-800 sm:text-6xl">
            Microscopic
          </h1>

          <p className="mt-1 font-display text-3xl font-bold text-teal-600 sm:text-5xl">
            System
          </p>

          <div className="mt-9">
            <h2 className="font-display text-3xl font-bold text-slate-800 sm:text-5xl">
              مرحباً بكم في
            </h2>

            <p className="mt-2 text-2xl font-bold text-teal-600 sm:text-4xl">
              Microscopic System ✨
            </p>
          </div>

          <p className="mx-auto mt-5 max-w-xl text-sm leading-7 text-slate-500 sm:text-base">
            إدارة معملية أكثر سهولة واحترافية
          </p>

          <div className="mt-8 grid w-full max-w-4xl grid-cols-2 gap-3 sm:grid-cols-5">
            <Feature
              icon={<FileText />}
              label="تقارير دقيقة"
            />

            <Feature
              icon={<Users />}
              label="المرضى"
            />

            <Feature
              icon={<FlaskConical />}
              label="التحاليل"
            />

            <Feature
              icon={<BarChart3 />}
              label="الإحصائيات"
            />

            <Feature
              icon={<ShieldCheck />}
              label="الأمان"
            />
          </div>

          <button
            type="button"
            onClick={() => {
              setProgress(0);
              setLoading(true);
            }}
            className="group mt-9 flex w-full max-w-sm items-center justify-center gap-3 rounded-2xl bg-teal-600 px-7 py-4 text-lg font-bold text-white shadow-lg shadow-teal-600/20 transition-all duration-200 hover:-translate-y-1 hover:bg-teal-700 hover:shadow-xl active:translate-y-0"
          >
            <span>ابدأ الآن</span>

            <span className="grid size-8 place-items-center rounded-full bg-white/15 transition-transform duration-200 group-hover:-translate-x-1">
              <ArrowLeft className="size-5" />
            </span>
          </button>
        </section>

        <footer className="pb-3 text-center">
          <div className="mx-auto mb-4 h-px w-24 bg-gradient-to-r from-transparent via-teal-300 to-transparent" />

          <p className="text-xs text-slate-400">
            فكرة وتصميم وتطوير
          </p>

          <p className="mt-1 text-lg font-bold text-slate-800">
            د/ محمد رجب
          </p>

          <p className="mt-1 text-sm font-medium text-teal-600">
            أخصائي التحاليل الطبية
          </p>

          <p className="mt-3 text-[9px] font-medium uppercase tracking-[0.25em] text-slate-300">
            Microscopic System
          </p>
        </footer>
      </div>
    </main>
  );
}

function Feature({
  icon,
  label,
}: {
  icon: ReactNode;
  label: string;
}) {
  return (
    <div className="flex items-center justify-center gap-2 rounded-2xl border border-slate-200/80 bg-white/75 px-3 py-3 shadow-sm backdrop-blur-sm">
      <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-teal-50 text-teal-600">
        {icon}
      </span>

      <span className="text-[11px] font-semibold text-slate-600 sm:text-xs">
        {label}
      </span>
    </div>
  );
}

function LoadingItem({
  icon,
  label,
}: {
  icon: ReactNode;
  label: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-slate-200/80 bg-white/80 px-2 py-3 shadow-sm">
      <span className="grid size-9 place-items-center rounded-xl bg-teal-50 text-teal-600">
        {icon}
      </span>

      <span className="text-[10px] font-semibold text-slate-500">
        {label}
      </span>
    </div>
  );
}
