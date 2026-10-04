import type { Sql } from "@/lib/db";

/** Named starting points for a lab's limits. null = unlimited. */
export const PLAN_PRESETS = [
  { key: "trial", label: "تجريبي", maxUsers: 2, maxReportsPerMonth: 50 },
  { key: "basic", label: "أساسي", maxUsers: 3, maxReportsPerMonth: 300 },
  { key: "pro", label: "احترافي", maxUsers: 10, maxReportsPerMonth: 2000 },
  { key: "unlimited", label: "بلا حدود", maxUsers: null, maxReportsPerMonth: null },
] as const;

export const PLAN_KEYS: string[] = PLAN_PRESETS.map((p) => p.key);

export type SubscriptionState = "none" | "active" | "expiring" | "expired";

const TZ = "Africa/Cairo";
const EXPIRING_DAYS = 7;

export function todayCairo(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: TZ });
}

/** Whole days from today (Cairo) to the end date, inclusive of the end date. Negative = expired. */
export function daysLeft(endsAt: string, today = todayCairo()): number {
  const a = Date.parse(`${today}T00:00:00Z`);
  const b = Date.parse(`${endsAt}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}

export function subscriptionState(endsAt: string | null, today = todayCairo()): SubscriptionState {
  if (!endsAt) return "none";
  const left = daysLeft(endsAt, today);
  if (left < 0) return "expired";
  return left <= EXPIRING_DAYS ? "expiring" : "active";
}

export const SUBSCRIPTION_EXPIRED_MESSAGE = "انتهى اشتراك المعمل. تواصل مع الدعم لتجديده — بياناتك محفوظة وتقدر تتصفحها.";

type PlanRow = {
  max_users: number | null;
  max_reports_per_month: number | null;
  subscription_ends_at: string | Date | null;
};

async function readPlan(sql: Sql, labId: string): Promise<PlanRow | null> {
  const rows = await sql<PlanRow>`
    select max_users, max_reports_per_month, to_char(subscription_ends_at, 'YYYY-MM-DD') as subscription_ends_at
    from labs where id = ${labId} limit 1
  `;
  return rows[0] ?? null;
}

function assertNotExpired(plan: PlanRow) {
  const ends = plan.subscription_ends_at ? String(plan.subscription_ends_at) : null;
  if (subscriptionState(ends) === "expired") throw new Error(SUBSCRIPTION_EXPIRED_MESSAGE);
}

/** Blocks creating a report when the subscription ended or the monthly limit is reached. */
export async function assertCanCreateReport(sql: Sql, labId: string): Promise<void> {
  const plan = await readPlan(sql, labId);
  if (!plan) return;
  assertNotExpired(plan);
  if (plan.max_reports_per_month == null) return;
  const rows = await sql<{ n: number }>`
    select count(*)::int as n from reports
    where lab_id = ${labId} and status <> 'cancelled'
      and created_at >= (date_trunc('month', current_timestamp at time zone 'Africa/Cairo') at time zone 'Africa/Cairo')
  `;
  if (Number(rows[0]?.n ?? 0) >= plan.max_reports_per_month) {
    throw new Error(`وصل المعمل للحد الأقصى من التقارير الشهرية (${plan.max_reports_per_month}). تواصل مع الدعم لترقية الباقة.`);
  }
}

/** Blocks adding (or re-activating) a user when the subscription ended or the user limit is reached. */
export async function assertCanAddUser(sql: Sql, labId: string): Promise<void> {
  const plan = await readPlan(sql, labId);
  if (!plan) return;
  assertNotExpired(plan);
  if (plan.max_users == null) return;
  const rows = await sql<{ n: number }>`
    select count(*)::int as n from lab_users where lab_id = ${labId} and is_active = true
  `;
  if (Number(rows[0]?.n ?? 0) >= plan.max_users) {
    throw new Error(`وصل المعمل للحد الأقصى من المستخدمين (${plan.max_users}). تواصل مع الدعم لترقية الباقة.`);
  }
}
