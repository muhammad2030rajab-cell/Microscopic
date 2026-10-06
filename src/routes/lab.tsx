import {
  createFileRoute,
  Navigate,
  Link,
  Outlet,
  redirect,
  useRouter,
  useRouterState,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import {
  BarChart3,
  CheckCircle2,
  ChevronLeft,
  CircleHelp,
  ClipboardCheck,
  ClipboardList,
  FilePlus2,
  FileText,
  Files,
  FlaskConical,
  Settings2,
  TriangleAlert,
  UserRoundSearch,
  Users,
} from "lucide-react";

import { AppShell } from "@/components/layout/app-shell";
import { UserButton, useCurrentUserState } from "@/lib/auth/gates";
import { getCurrentAccess, getCurrentLab, getLabDashboardStats, type LabProfileData } from "@/lib/lab-access";
import { loadLocalDashboard } from "@/lib/sync-engine/offline-fallback";
import { requestAllOfflinePages } from "@/lib/offline/sync";
import { getRecentLabReports, type RecentReport } from "@/lib/lab-reports";
import { getCurrentLabPermissions, type LabPermissions } from "@/lib/lab-users";
import { formatAge } from "@/lib/age";
import { presetReportFilters, type ReportFilters } from "@/lib/reports-filters";
import { reportStatusClasses, reportStatusLabels } from "@/lib/report-workflow";
import { cn, formatListDate } from "@/lib/utils";

export const Route = createFileRoute("/lab")({
  // The data loads in the browser (never in the server-rendered HTML): the saved offline copy of this page
  // then holds no patient data, and with no connection the loader answers from the device copy instead.
  ssr: false,
  loader: async () => {
    try {
      const [lab, stats, access, recent] = await Promise.all([
        getCurrentLab(),
        getLabDashboardStats(),
        getCurrentLabPermissions(),
        // Not everyone may view reports; the home screen must still load for them.
        getRecentLabReports().catch(() => [] as RecentReport[]),
      ]);

      return { lab, stats, permissions: access.permissions, recent, loadFailed: false, offline: false };
    } catch (error) {
      // No connection: the home screen from the device copy (counters, latest reports, lab header).
      if (typeof window !== "undefined") {
        const local = await loadLocalDashboard<LabProfileData>(error);
        if (local) {
          return { lab: local.lab, stats: local.stats, permissions: local.permissions as LabPermissions, recent: local.recent, loadFailed: false, offline: true };
        }
      }
      // لو الحساب اتوقف وهو داخل، نحوّله لصفحة الدخول (فيها رسالة التواصل مع المدير)
      const access = await getCurrentAccess().catch(() => null);
      if (access?.type === "suspended") throw redirect({ to: "/login" });
      // حساب المدير ملوش معمل: نوديه للوحته بدل ما نرجّعه لتسجيل الدخول.
      if (access?.type === "admin") throw redirect({ to: "/admin" });

      return {
        lab: null,
        // الحساب سليم ومرتبط بمعمل لكن التحميل فشل: نعرض رسالة بدل دايرة login <-> lab.
        loadFailed: access?.type === "lab",
        offline: false,
        stats: {
          patients: 0,
          reportsToday: 0,
          pendingReview: 0,
          approved: 0,
          critical: 0,
        },
        permissions: {} as LabPermissions,
        recent: [] as RecentReport[],
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

  const { lab, stats, permissions, recent, loadFailed, offline } = Route.useLoaderData();
  const router = useRouter();

  // Signed in and loaded: keep the other offline screens ready on this device.
  useEffect(() => {
    if (lab && !loadFailed && navigator.onLine) requestAllOfflinePages();
  }, [lab, loadFailed]);

  /*
   * Child routes such as /lab/setup are rendered through Outlet.
   */
  if (pathname !== "/lab") {
    return <Outlet />;
  }

  if (isPending && !offline) {
    return (
      <main className="grid min-h-screen place-items-center bg-paper">
        جارٍ التحقق…
      </main>
    );
  }

  if (loadFailed && user) {
    return (
      <main className="grid min-h-screen place-items-center bg-paper px-4 text-center">
        <div className="max-w-sm space-y-4">
          <p className="text-lg font-semibold">تعذّر تحميل بيانات المعمل</p>
          <p className="text-sm text-muted">
            حصلت مشكلة مؤقتة في الاتصال بالسيرفر. تأكد من الإنترنت وحاول تاني.
          </p>
          <button
            type="button"
            className="rounded-lg bg-ink px-4 py-2 text-sm text-paper"
            onClick={() => void router.invalidate()}
          >
            إعادة المحاولة
          </button>
        </div>
      </main>
    );
  }

  // With no connection the sign-in session cannot be re-checked (it is read from the server), so a home
  // screen answered from the device copy is allowed without it. That copy is only ever used after a network
  // failure, never after the server rejected the session, and it is wiped on sign-out.
  if (!lab || (!user && !offline)) {
    return <Navigate to="/login" replace />;
  }

  if (!lab.is_profile_complete) {
    return <Navigate to="/lab/setup" />;
  }

  const greetingName = lab.doctor_name
    ? `د. ${lab.doctor_name}`
    : lab.lab_name;

  const canView = permissions["reports.view"] === true;

  return (
    <AppShell>
      <header className="mb-4 flex items-center justify-between gap-3 lg:hidden">
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-[0.2em] text-muted">
            Medical Laboratory
          </p>

          <h1 className="mt-0.5 truncate font-display text-lg font-semibold">
            {lab.lab_name}
          </h1>
        </div>

        <UserButton />
      </header>

      {/* Greeting + the one thing people open the app to do */}
      <section className="relative overflow-hidden rounded-2xl bg-ink p-5 text-paper sm:p-7">
        <div className="relative z-10">
          <p className="text-sm text-paper/60">مرحبًا 👋</p>

          <h2 className="mt-1 font-display text-xl font-semibold sm:text-3xl">
            {greetingName}
          </h2>

          <p className="mt-2 hidden max-w-sm text-sm leading-7 text-paper/65 sm:block">
            دقة في التحليل .. ثقة في النتيجة
          </p>

          {permissions["reports.create"] ? (
            <Link
              to="/new"
              className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-paper text-base font-semibold text-ink transition active:scale-[0.99] sm:w-auto sm:px-7"
            >
              <FilePlus2 className="size-5" />
              تقرير جديد
            </Link>
          ) : null}
        </div>
      </section>

      {/* Today at a glance — each card opens the archive already filtered */}
      <section aria-label="ملخص اليوم" className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
        <StatLink
          to="/reports"
          preset={{ period: "today" }}
          disabled={!canView}
          label="تقارير اليوم"
          value={stats.reportsToday}
          icon={<FileText className="size-4" />}
        />

        <StatLink
          to="/reports"
          preset={{ status: "pending_review" }}
          disabled={!canView}
          label="تحت المراجعة"
          value={stats.pendingReview}
          icon={<ClipboardCheck className="size-4" />}
          tone={stats.pendingReview > 0 ? "warn" : undefined}
        />

        <StatLink
          to="/reports"
          preset={{ period: "today", onlyCritical: true }}
          disabled={!canView}
          label="حرجة اليوم"
          value={stats.critical}
          icon={<TriangleAlert className="size-4" />}
          tone={stats.critical > 0 ? "danger" : undefined}
        />

        <StatLink
          to="/reports"
          preset={{ status: "approved" }}
          disabled={!canView}
          label="معتمدة"
          value={stats.approved}
          icon={<CheckCircle2 className="size-4" />}
        />

        <StatLink
          to="/patients"
          label="المرضى"
          value={stats.patients}
          icon={<Users className="size-4" />}
          className="col-span-2 sm:col-span-1"
        />
      </section>

      {/* Latest reports */}
      {canView ? (
        <section className="mt-5">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold">آخر التقارير</h2>
            <Link
              to="/reports"
              onClick={() => presetReportFilters({})}
              className="inline-flex min-h-9 items-center gap-1 text-sm text-teal"
            >
              كل التقارير
              <ChevronLeft className="size-4" />
            </Link>
          </div>

          {recent.length === 0 ? (
            <p className="rounded-xl border border-dashed border-line px-4 py-8 text-center text-sm text-muted">
              لا توجد تقارير بعد. ابدأ بإنشاء أول تقرير.
            </p>
          ) : (
            <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-elevated">
              {recent.map((r) => (
                <li key={r.id}>
                  <Link
                    to="/reports/$id"
                    params={{ id: r.id }}
                    className="flex items-center gap-3 px-4 py-3 hover:bg-paper-2/50"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{r.patientName}</p>
                      <p className="mt-0.5 text-xs text-muted">
                        {formatAge("ar", r.age, r.ageUnit)} · {r.gender} · {formatListDate(r.createdAt)}
                      </p>
                    </div>

                    {r.criticalCount > 0 ? (
                      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-high-bg px-2 py-1 text-[11px] font-medium text-high">
                        <TriangleAlert className="size-3" />
                        حرج
                      </span>
                    ) : r.flaggedCount > 0 ? (
                      <span className="shrink-0 text-[11px] text-high">{r.flaggedCount} علامة</span>
                    ) : null}

                    <span
                      className={cn(
                        "shrink-0 rounded-full px-2 py-1 text-[11px]",
                        reportStatusClasses[r.status],
                      )}
                    >
                      {reportStatusLabels[r.status]}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}

      {/* Everything else: small tiles, so they do not push the useful parts off-screen */}
      <section aria-label="اختصارات" className="mt-5 grid grid-cols-3 gap-2.5 sm:grid-cols-6">
        <Shortcut to="/reports" icon={<Files />} label="الأرشيف" onClick={() => presetReportFilters({})} />
        <Shortcut to="/patients" icon={<UserRoundSearch />} label="المرضى" />
        <Shortcut to="/catalog" icon={<ClipboardList />} label="دليل التحاليل" />
        <Shortcut to="/methods" icon={<FlaskConical />} label="كيف يتم التحليل" />
        <Shortcut to="/analytics" icon={<BarChart3 />} label="الإحصائيات" />
        {lab.role === "owner" ? <Shortcut to="/settings" icon={<Settings2 />} label="الإعدادات" /> : null}
        <Shortcut to="/help" icon={<CircleHelp />} label="مساعدة" />
      </section>
    </AppShell>
  );
}

function StatLink({
  to,
  preset,
  label,
  value,
  icon,
  tone,
  disabled = false,
  className,
}: {
  to: string;
  preset?: Partial<ReportFilters>;
  label: string;
  value: number;
  icon: ReactNode;
  tone?: "warn" | "danger";
  disabled?: boolean;
  className?: string;
}) {
  const body = (
    <>
      <span
        className={cn(
          "inline-flex items-center gap-1.5 text-xs",
          tone === "danger" ? "text-high" : tone === "warn" ? "text-amber-700" : "text-muted",
        )}
      >
        {icon}
        {label}
      </span>
      <span className="mt-1 block font-display text-3xl font-semibold leading-none">{value}</span>
    </>
  );

  const box = cn(
    "block rounded-xl border bg-elevated p-3.5",
    tone === "danger" ? "border-high/40 bg-high-bg/40" : tone === "warn" ? "border-amber-300" : "border-line",
    className,
  );

  if (disabled) return <div className={box}>{body}</div>;

  return (
    <Link
      to={to}
      onClick={preset ? () => presetReportFilters(preset) : undefined}
      className={cn(box, "transition active:scale-[0.99] hover:shadow-sm")}
    >
      {body}
    </Link>
  );
}

function Shortcut({
  to,
  icon,
  label,
  onClick,
}: {
  to: string;
  icon: ReactNode;
  label: string;
  onClick?: () => void;
}) {
  return (
    <Link
      to={to}
      onClick={onClick}
      className="flex min-h-20 flex-col items-center justify-center gap-1.5 rounded-xl border border-line bg-elevated p-2 text-center text-xs font-medium text-ink-soft transition hover:shadow-sm active:scale-[0.98] [&_svg]:size-5 [&_svg]:text-teal"
    >
      {icon}
      {label}
    </Link>
  );
}
