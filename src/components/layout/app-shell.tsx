import { Link, useRouterState } from "@tanstack/react-router";
import {
  BookOpen,
  FilePlus2,
  Files,
  FlaskConical,
  LayoutDashboard,
  Settings,
  Users,
} from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";
import { useLabStore } from "@/lib/store";

const DESKTOP_NAV = [
  {
    to: "/lab",
    label: "الرئيسية",
    icon: LayoutDashboard,
  },
  {
    to: "/new",
    label: "تقرير جديد",
    icon: FilePlus2,
  },
  {
    to: "/reports",
    label: "التقارير",
    icon: Files,
  },
  {
    to: "/catalog",
    label: "دليل التحاليل",
    icon: BookOpen,
  },
  {
    to: "/settings",
    label: "المختبر",
    icon: Settings,
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
        <aside className="no-print sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-e border-line bg-surface/70 px-4 py-6 lg:flex">
          <Brand
            name={lab.name}
            nameEn={lab.nameEn}
          />

          <nav className="mt-8 flex flex-1 flex-col gap-1">
            {DESKTOP_NAV.map((item) => (
              <NavLink
                key={item.to}
                {...item}
                active={isActive(pathname, item.to)}
              />
            ))}
          </nav>

          <p className="mt-auto pt-6 text-[11px] leading-relaxed text-muted">
            بيانات المعمل وتقاريره محفوظة على النظام بشكل مستقل.
            ليست بديلاً عن الرأي الطبي.
          </p>
        </aside>

        {/* Main Content */}
        <div className="flex min-w-0 flex-1 flex-col">
          {/* Top Header */}
          <header className="no-print flex items-center justify-between gap-3 border-b border-line px-4 py-3 sm:px-6 lg:px-8">
            <div className="lg:hidden">
              <Brand
                compact
                name={lab.name}
                nameEn={lab.nameEn}
              />
            </div>

            <p className="hidden text-xs text-muted lg:block">
              {lab.doctorName} · {lab.doctorSpecialty}
            </p>

            <Link
              to="/new"
              className="inline-flex h-10 items-center gap-2 rounded-sm bg-teal px-3 text-sm font-medium text-teal-fg transition-opacity hover:opacity-90"
            >
              <FilePlus2 className="size-4" />
              تقرير جديد
            </Link>
          </header>

          {/* Page */}
          <main className="flex-1 px-4 py-6 pb-24 sm:px-6 lg:px-8 lg:pb-10">
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
      <span className="flex size-9 items-center justify-center rounded-sm bg-teal text-teal-fg">
        <FlaskConical className="size-4" />
      </span>

      <span className="min-w-0">
        <span className="block truncate font-display text-sm font-semibold leading-tight tracking-tight">
          {compact ? nameEn : name}
        </span>

        {!compact ? (
          <span className="block text-[10px] uppercase tracking-[0.18em] text-muted">
            {nameEn}
          </span>
        ) : null}
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
      className={cn(
        "flex h-11 items-center gap-3 rounded-sm px-3 text-sm transition-colors duration-150",
        active
          ? "bg-ink text-paper"
          : "text-ink-soft hover:bg-paper-2 hover:text-ink",
      )}
    >
      <Icon className="size-4" />

      {label}
    </Link>
  );
}
