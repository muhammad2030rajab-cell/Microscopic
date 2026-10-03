import {
  createFileRoute,
  Navigate,
  Link,
  Outlet,
  useRouterState,
} from "@tanstack/react-router";
import type { ReactNode } from "react";
import {
  FileText,
  FlaskConical,
  Microscope,
  Settings2,
  UserRoundSearch,
  ClipboardList,
  BarChart3,
  CircleHelp,
} from "lucide-react";

import { AppShell } from "@/components/layout/app-shell";
import { UserButton, useCurrentUserState } from "@/lib/auth/gates";
import { getCurrentLab, getLabDashboardStats } from "@/lib/lab-access";
import { getCurrentLabPermissions, type LabPermissions } from "@/lib/lab-users";

export const Route = createFileRoute("/lab")({
  loader: async () => {
    try {
      const [lab, stats, access] = await Promise.all([
        getCurrentLab(),
        getLabDashboardStats(),
        getCurrentLabPermissions(),
      ]);

      return { lab, stats, permissions: access.permissions };
    } catch {
      return {
        lab: null,
        stats: {
          patients: 0,
          reportsToday: 0,
          pendingReview: 0,
          approved: 0,
          critical: 0,
        },
        permissions: {} as LabPermissions,
      };
    }
  },

  component: LabDashboard,
});

function LabDashboard() {
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });

  const { user, isPending } = useCurrentUserState();

  const { lab, stats, permissions } = Route.useLoaderData();

  /*
   * Child routes such as:
   * /lab/setup
   * /lab/...
   *
   * are rendered through Outlet.
   */
  if (pathname !== "/lab") {
    return <Outlet />;
  }

  if (isPending) {
    return (
      <main className="grid min-h-screen place-items-center bg-paper">
        جارٍ التحقق…
      </main>
    );
  }

  if (!user || !lab) {
    return <Navigate to="/login" replace />;
  }

  if (!lab.is_profile_complete) {
    return <Navigate to="/lab/setup" />;
  }

  const greetingName = lab.doctor_name
    ? `د. ${lab.doctor_name}`
    : lab.lab_name;

  return (
    <AppShell lab={{ name: lab.lab_name, nameEn: lab.lab_name_en, doctorName: lab.doctor_name, doctorSpecialty: lab.doctor_specialty }}>
      <header className="mb-4 flex items-center justify-between gap-3 lg:hidden">
        <div>
          <p className="text-[11px] uppercase tracking-[0.2em] text-muted">
            Medical Laboratory
          </p>

          <h1 className="mt-0.5 font-display text-lg font-semibold">
            {lab.lab_name}
          </h1>
        </div>

        <UserButton />
      </header>

      <section className="relative overflow-hidden rounded-2xl bg-ink p-6 text-paper sm:p-8">
        <div className="relative z-10">
          <p className="text-sm text-paper/60">
            مرحبًا 👋
          </p>

          <h2 className="mt-2 font-display text-2xl font-semibold sm:text-3xl">
            {greetingName}
          </h2>

          <p className="mt-3 max-w-sm text-sm leading-7 text-paper/65">
            دقة في التحليل .. ثقة في النتيجة
          </p>
        </div>

        <div className="pointer-events-none absolute -left-6 -top-6 grid size-32 place-items-center rounded-full bg-teal/25 sm:size-40">
          <Microscope
            className="size-14 text-paper/80 sm:size-16"
            strokeWidth={1.2}
          />
        </div>
      </section>

      <section className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {permissions["reports.create"] ? (
          <GridAction
            to="/new"
            icon={<FlaskConical />}
            color="teal"
            label="تقرير جديد"
          />
        ) : null}

        <GridAction
          to="/reports"
          icon={<FileText />}
          color="indigo"
          label="أرشيف التقارير"
        />

        <GridAction
          to="/catalog"
          icon={<ClipboardList />}
          color="violet"
          label="قائمة التحاليل"
        />

        <GridAction
          to="/patients"
          icon={<UserRoundSearch />}
          color="amber"
          label="المرضى"
        />

        <GridAction
          to="/analytics"
          icon={<BarChart3 />}
          color="sky"
          label="التحليلات"
        />

        {lab.role === "owner" ? (
          <GridAction
            to="/settings"
            icon={<Settings2 />}
            color="slate"
            label="الإعدادات"
          />
        ) : null}

        <GridAction
          to="/help"
          icon={<CircleHelp />}
          color="rose"
          label="مساعدة"
        />
      </section>

      <section className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <StatCard
          label="إجمالي المرضى"
          value={stats.patients}
          icon="👥"
        />

        <StatCard
          label="تقارير اليوم"
          value={stats.reportsToday}
          icon="🧾"
        />

        <StatCard
          label="تحت المراجعة"
          value={stats.pendingReview}
          icon="🔎"
          emphasis={stats.pendingReview > 0}
        />

        <StatCard
          label="تقارير معتمدة"
          value={stats.approved}
          icon="✅"
        />

        <StatCard
          label="نتائج حرجة"
          value={stats.critical}
          icon="🚨"
          emphasis={stats.critical > 0}
        />
      </section>
    </AppShell>
  );
}

const GRID_COLORS = {
  teal: "bg-teal/10 text-teal",
  indigo: "bg-indigo-500/10 text-indigo-600",
  violet: "bg-violet-500/10 text-violet-600",
  amber: "bg-amber-500/10 text-amber-600",
  slate: "bg-slate-500/10 text-slate-600",
  rose: "bg-rose-500/10 text-rose-600",
  sky: "bg-sky-500/10 text-sky-600",
} as const;

function GridAction({
  to,
  icon,
  color,
  label,
}: {
  to: string;
  icon: ReactNode;
  color: keyof typeof GRID_COLORS;
  label: string;
}) {
  return (
    <Link
      to={to}
      className="flex flex-col items-center gap-2.5 rounded-xl border border-line bg-elevated p-4 text-center transition hover:-translate-y-0.5 hover:shadow-sm sm:p-5"
    >
      <span
        className={`grid size-12 place-items-center rounded-2xl ${GRID_COLORS[color]}`}
      >
        {icon}
      </span>

      <span className="text-sm font-medium">
        {label}
      </span>
    </Link>
  );
}

function StatCard({
  label,
  value,
  icon,
  emphasis = false,
}: {
  label: string;
  value: number;
  icon: string;
  emphasis?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border bg-elevated p-4 ${
        emphasis ? "border-amber-300" : "border-line"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-xl" aria-hidden="true">
          {icon}
        </span>

        <span className="font-display text-2xl font-semibold">
          {value}
        </span>
      </div>

      <p className="mt-2 text-xs text-muted">
        {label}
      </p>
    </div>
  );
}
