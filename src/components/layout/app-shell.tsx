import { OfflineStatus } from "@/components/offline-status";
import { AnnouncementBanner } from "@/components/announcement-banner";
import { UserButton } from "@/lib/auth/gates";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  BookOpen,
  Boxes,
  FilePlus2,
  Files,
  FlaskConical,
  LayoutDashboard,
  Microscope,
  Settings,
  Stethoscope,
  Users,
  UsersRound,
  Wallet,
} from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";
import { useLabStore } from "@/lib/store";

const DESKTOP_NAV_GROUPS = [
  {
    title: "الشغل اليومي",
    items: [
      { to: "/lab", label: "الرئيسية", icon: LayoutDashboard },
      { to: "/new", label: "إدخال النتائج", icon: FilePlus2 },
      { to: "/reports", label: "التقارير", icon: Files },
      { to: "/patients", label: "المرضى", icon: Users },
      { to: "/contacts", label: "الأطباء والعملاء", icon: Stethoscope },
    ],
  },
  {
    title: "إدارة المعمل",
    items: [
      { to: "/catalog", label: "دليل التحاليل", icon: BookOpen },
      { to: "/billing", label: "الحسابات", icon: Wallet },
      { to: "/inventory", label: "الأجهزة والمستلزمات", icon: Boxes },
      { to: "/team", label: "المستخدمين", icon: UsersRound },
      { to: "/methods", label: "كيف يتم التحليل؟", icon: Microscope },
      { to: "/settings", label: "الإعدادات", icon: Settings },
    ],
  },
] as const;

const MOBILE_NAV = [
  {
    to: "/lab",
    label: "الرئيسية",
    icon: LayoutDashboard,
  },
  {
    to: "/patients",
    label: "المرضى",
    icon: Users,
  },
  {
    to: "/catalog",
    label: "التحاليل",
    icon: FlaskConical,
  },
  {
    to: "/reports",
    label: "التقارير",
    icon: Files,
  },
  {
    to: "/settings",
    label: "المزيد",
    icon: Settings,
  },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = useRouterState({
    select: (s) => s.location.pathname,
  });

  const lab = useLabStore((s) => s.lab);

  return (
    <div className="min-h-dvh bg-paper text-ink">
      <div className="mx-auto flex min-h-dvh max-w-[1400px]">
        {/* Desktop Sidebar */}
        <aside className="app-sidebar no-print sticky top-0 hidden h-dvh w-64 shrink-0 flex-col overflow-y-auto border-e border-white/10 px-4 py-6 text-white lg:flex">
          <Brand
            name={lab.name}
            nameEn={lab.nameEn}
          />

          <nav className="mt-7 flex flex-1 flex-col gap-5">
            {DESKTOP_NAV_GROUPS.map((group) => (
              <div key={group.title}>
                <p className="mb-1.5 px-3 text-[11px] font-medium text-white/45">
                  {group.title}
                </p>
                <div className="flex flex-col gap-0.5">
                  {group.items.map((item) => (
                    <NavLink
                      key={item.to}
                      {...item}
                      active={isActive(pathname, item.to)}
                    />
                  ))}
                </div>
              </div>
            ))}
          </nav>

          <div className="mt-6 rounded-xl border border-white/10 bg-white/5 p-3">
            <p className="truncate text-sm font-semibold">{lab.name}</p>
            {lab.doctorName ? (
              <p className="mt-0.5 truncate text-[11px] text-white/60">
                {lab.doctorName}
                {lab.doctorSpecialty ? ` · ${lab.doctorSpecialty}` : ""}
              </p>
            ) : null}
            <p className="mt-2 text-[10px] leading-relaxed text-white/40">
              النتائج لا تغني عن الرأي الطبي.
            </p>
          </div>
        </aside>

        {/* Main Content */}
        <div className="flex min-w-0 flex-1 flex-col">
          {/* Top Header */}
          <header className="no-print sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-line bg-paper/85 px-4 py-3 backdrop-blur-md sm:px-6 lg:px-8">
            <div className="lg:hidden">
              <Brand
                compact
                name={lab.name}
                nameEn={lab.nameEn}
              />
            </div>

            <p className="hidden text-sm font-medium text-ink-soft lg:block">
              {lab.name}
            </p>

            <div className="flex items-center gap-3">
              <Link
                to="/new"
                className="inline-flex h-10 items-center gap-2 rounded-lg bg-teal px-4 text-sm font-semibold text-teal-fg shadow-[0_8px_18px_-10px_rgb(47_111_237/0.9)] transition hover:bg-teal-deep"
              >
                <FilePlus2 className="size-4" />
                تقرير جديد
              </Link>

              <div className="hidden lg:block">
                <UserButton />
              </div>
            </div>
          </header>

          <OfflineStatus />

          {/* Page */}
          <main className="flex-1 px-4 py-6 pb-24 sm:px-6 lg:px-8 lg:pb-10">
            <AnnouncementBanner />
            {children}
          </main>
        </div>
      </div>

      {/* Mobile Bottom Navigation */}
      <nav className="bottom-nav no-print fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 backdrop-blur-sm lg:hidden">
        <ul className="grid grid-cols-5">
          {MOBILE_NAV.map((item) => {
            const Icon = item.icon;
            const active = isActive(pathname, item.to);

            return (
              <li key={item.to}>
                <Link
                  to={item.to}
                  className={cn(
                    "flex h-16 flex-col items-center justify-center gap-1 text-[11px] transition-colors",
                    active
                      ? "text-teal"
                      : "text-muted hover:text-ink",
                  )}
                >
                  <Icon
                    className="size-5"
                    strokeWidth={active ? 2.2 : 1.7}
                  />

                  <span>{item.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}

function isActive(pathname: string, to: string) {
  if (to === "/") {
    return pathname === "/";
  }

  return (
    pathname === to ||
    pathname.startsWith(`${to}/`)
  );
}

function Brand({
  name,
  nameEn,
  compact,
}: {
  name: string;
  nameEn: string;
  compact?: boolean;
}) {
  return (
    <Link
      to="/"
      className="flex items-center gap-2.5"
    >
      <span className="flex size-10 items-center justify-center rounded-xl bg-gradient-to-br from-teal to-accent text-teal-fg shadow-[0_8px_20px_-8px_rgb(25_181_200/0.8)]">
        <Microscope className="size-5" />
      </span>

      <span className="min-w-0">
        <span
          dir="ltr"
          className={cn(
            "block truncate font-sans text-lg font-bold leading-tight tracking-tight",
            compact ? "text-ink" : "text-white",
          )}
        >
          Microscopic
        </span>

        <span
          className={cn(
            "block truncate text-[10px] leading-tight",
            compact ? "text-muted" : "text-white/60",
          )}
        >
          {compact ? nameEn : name}
        </span>
      </span>
    </Link>
  );
}

function NavLink({
  to,
  label,
  icon: Icon,
  active,
}: {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  active: boolean;
}) {
  return (
    <Link
      to={to}
      data-active={active}
      className={cn(
        "app-nav-link flex h-10 items-center gap-3 rounded-lg px-3 text-sm transition-colors duration-150",
        active
          ? "bg-white/12 font-semibold text-white"
          : "text-white/70 hover:bg-white/8 hover:text-white",
      )}
    >
      <Icon className={cn("size-4", active && "text-accent")} />

      {label}
    </Link>
  );
}
