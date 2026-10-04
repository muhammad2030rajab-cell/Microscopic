import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { requireLabPermission } from "@/lib/lab-users";
import { assertLabFeature } from "@/lib/lab-features";

export type LabAnalytics = {
  daily: { day: string; count: number }[];
  statusBreakdown: { status: string; count: number }[];
  topTests: { name: string; count: number }[];
  criticalCount: number;
  totalPatients: number;
  totalReports: number;
};

export const getLabAnalytics = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<LabAnalytics> => {
    const { sql, labId } = await requireLabPermission(context.userId, "reports.view");
    await assertLabFeature(sql, labId, "analytics");

    const daily = await sql<{ day: string; count: number }>`
      select to_char(d.day, 'YYYY-MM-DD') as day, coalesce(count(r.id), 0)::int as count
      from generate_series(current_date - interval '13 days', current_date, interval '1 day') as d(day)
      left join reports r on r.created_at::date = d.day and r.lab_id = ${labId}
      group by d.day
      order by d.day asc
    `;

    const statusBreakdown = await sql<{ status: string; count: number }>`
      select status, count(*)::int as count from reports where lab_id = ${labId} group by status
    `;

    const topTests = await sql<{ name: string; count: number }>`
      select rr.test_name as name, count(*)::int as count
      from report_results rr
      inner join reports r on r.id = rr.report_id
      where r.lab_id = ${labId}
      group by rr.test_name
      order by count(*) desc
      limit 8
    `;

    const totals = await sql<{ critical: number; patients: number; reports: number }>`
      select
        (select count(*)::int from report_results rr inner join reports r on r.id = rr.report_id where r.lab_id = ${labId} and rr.flag = 'critical') as critical,
        (select count(*)::int from patients where lab_id = ${labId}) as patients,
        (select count(*)::int from reports where lab_id = ${labId}) as reports
    `;

    return {
      daily,
      statusBreakdown,
      topTests,
      criticalCount: totals[0]?.critical ?? 0,
      totalPatients: totals[0]?.patients ?? 0,
      totalReports: totals[0]?.reports ?? 0,
    };
  });
