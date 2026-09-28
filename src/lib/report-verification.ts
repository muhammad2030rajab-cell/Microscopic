import { createServerFn } from "@tanstack/react-start";
import { getSql } from "@/lib/db";

export type ReportVerification = {
  valid: boolean;
  labName?: string;
  patientName?: string;
  sampleId?: string;
  collectedAt?: string;
  approvedAt?: string;
};

/**
 * نقطة عامة بدون تسجيل دخول — تتحقق فقط من أن التقرير معتمد فعليًا وصادر من هذا
 * المعمل. لا ترجع أي نتائج تحاليل أو بيانات طبية، فقط ما هو مطبوع على الورقة
 * أصلًا (اسم المريض ورقم العينة)، تجنبًا لتسريب بيانات إكلينيكية عبر رابط عام.
 */
export const verifyReport = createServerFn({ method: "GET" })
  .handler(async ({ data }: { data: { id: string } }): Promise<ReportVerification> => {
    const sql = await getSql();
    const rows = await sql<{
      lab_name: string; full_name: string; sample_id: string | null;
      collected_at: string | Date | null; approved_at: string | Date | null;
    }>`
      select l.name as lab_name, p.full_name, r.sample_id, r.collected_at, r.approved_at
      from reports r
      inner join labs l on l.id = r.lab_id
      inner join patients p on p.id = r.patient_id
      where r.id = ${data.id} and r.status = 'approved'
      limit 1
    `;
    if (!rows.length) return { valid: false };
    const r = rows[0];
    return {
      valid: true,
      labName: r.lab_name,
      patientName: r.full_name,
      sampleId: r.sample_id || undefined,
      collectedAt: r.collected_at ? String(r.collected_at).slice(0, 10) : undefined,
      approvedAt: r.approved_at ? String(r.approved_at) : undefined,
    };
  });
