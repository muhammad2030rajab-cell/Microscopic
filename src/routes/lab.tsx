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
  Settings2,
  UserRoundSearch,
  ClipboardList,
  BarChart3,
  CircleHelp,
  ChevronLeft,
  Users,
  Clock,
  CircleCheck,
  TriangleAlert,
} from "lucide-react";

import { AppShell } from "@/components/layout/app-shell";
import { FieldOfView } from "@/components/brand/field-of-view";
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
    <AppShell>
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

        <FieldOfView className="pointer-events-none absolute -left-10 -top-10 size-40 opacity-90 sm:size-48" />
      </section>

      {/* الإجراء الأساسي */}
      {permissions["reports.create"] ? (
        <Link
          to="/new"
          className="mt-5 flex items-center gap-4 rounded-2xl bg-teal p-5 text-teal-fg transition hover:bg-teal-deep sm:p-6"
        >
          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-white/15">
            <FlaskConical className="size-5" />
          </span>

          <span className="flex-1">
            <span className="block font-display text-lg font-semibold">
              تقرير جديد
            </span>
            <span className="block text-sm text-teal-fg/75">
              ابدأ بإدخال بيانات المريض والنتائج
            </span>
          </span>

          <ChevronLeft className="size-5 shrink-0 opacity-70" />
        </Link>
      ) : null}

      <section className="mt-4 grid grid-cols-3 gap-3 sm:grid-cols-6">
        <GridAction to="/reports" icon={<FileText />} label="الأرشيف" />
        <GridAction to="/catalog" icon={<ClipboardList />} label="التحاليل" />
        <GridAction to="/patients" icon={<UserRoundSearch />} label="المرضى" />
        <GridAction to="/analytics" icon={<BarChart3 />} label="التحليلات" />
        {lab.role === "owner" ? (
          <GridAction to="/settings" icon={<Settings2 />} label="الإعدادات" />
        ) : null}
        <GridAction to="/help" icon={<CircleHelp />} label="مساعدة" />
      </section>

      <section className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <StatCard
          label="إجمالي المرضى"
          value={stats.patients}
          icon={<Users />}
        />

        <StatCard
          label="تقارير اليوم"
          value={stats.reportsToday}
          icon={<FileText />}
        />

        <StatCard
          label="تحت المراجعة"
          value={stats.pendingReview}
          icon={<Clock />}
          emphasis={stats.pendingReview > 0}
        />

        <StatCard
          label="تقارير معتمدة"
          value={stats.approved}
          icon={<CircleCheck />}
        />

        <StatCard
          label="نتائج حرجة"
          value={stats.critical}
          icon={<TriangleAlert />}
          emphasis={stats.critical > 0}
        />
      </section>
    </AppShell>
  );
}

function GridAction({
  to,
  icon,
  label,
}: {
  to: string;
  icon: ReactNode;
  label: string;
}) {
  return (
    <Link
      to={to}
      className="flex flex-col items-center gap-2 rounded-xl border border-line bg-elevated p-3 text-center transition hover:-translate-y-0.5 hover:border-teal/40 hover:shadow-sm sm:p-4"
    >
      <span className="grid size-10 place-items-center rounded-xl bg-teal/10 text-teal">
        {icon}
      </span>

      <span className="text-xs font-medium leading-tight sm:text-sm">
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
  icon: ReactNode;
  emphasis?: boolean;
}) {
  return (
    <div className="rounded-xl border border-line bg-elevated p-4">
      <div className="flex items-center justify-between gap-2">
        <span
          className={`grid size-8 place-items-center rounded-lg ${
            emphasis ? "bg-high/10 text-high" : "bg-ink/5 text-ink-soft"
          }`}
        >
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
