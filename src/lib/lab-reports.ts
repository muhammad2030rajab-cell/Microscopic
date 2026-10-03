import { createServerFn } from "@tanstack/react-start";
import { isValidPhone, phoneDigits } from "@/lib/phone";
import { effectiveCreatedAt } from "@/lib/offline/created-at";
import { resolveRange } from "@/lib/range-resolution";
import { ageProblem, ageToYears, parseAgeUnit, type AgeUnit } from "@/lib/age";
import { SQL_FOLD_FROM, SQL_FOLD_TO, normalizeSearch } from "@/lib/search-text";
import { randomUUID } from "node:crypto";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { addCalculatedTests, interpretResult, isCritical, type DraftTest } from "@/lib/medical";
import { getNormalRange } from "@/lib/tests-catalog";
import { requireLabPermission, type LabPermission } from "@/lib/lab-users";

async function getLabContext(userId: string, permission?: LabPermission) {
  const sql = await getSql();
  const rows = await sql<{
    lab_user_id: string;
    lab_id: string;
    lab_name: string;
    username: string;
    role: string;
  }>`
    select lu.id as lab_user_id, l.id as lab_id, l.name as lab_name, lu.username, lu.role
    from lab_users lu
    inner join labs l on l.id = lu.lab_id
    where lu.auth_user_id = ${userId}
      and lu.is_active = true
      and l.is_active = true
    limit 1
  `;
  if (!rows.length) throw new Error("LAB_ACCESS_REQUIRED");
  if (permission) await requireLabPermission(userId, permission);
  return { sql, ...rows[0] };
}

export type CreateLabReportInput = {
  patientName: string;
  patientCode?: string;
  age: number;
  /** Unit of `age`. Missing = years (old clients / old offline-queued reports). */
  ageUnit?: AgeUnit;
  gender: "ذكر" | "أنثى";
  phone?: string;
  nationalId?: string;
  doctor?: string;
  notes?: string;
  collectedAt?: string;
  tests: DraftTest[];
  /** Offline support: makes create idempotent across retries (see migration 0012). */
  clientRequestId?: string;
  /** When the report was actually entered on the device (ISO). Used if plausible. */
  clientCreatedAt?: string;
  /** Lab the device believed it was signed in to; a mismatch is rejected. */
  expectedLabId?: string;
};

export const createLabReport = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context, data }: { context: { userId: string }; data: CreateLabReportInput }) => {
    const { sql, lab_user_id, lab_id } = await getLabContext(context.userId, "reports.create");
    if (data.expectedLabId && data.expectedLabId !== lab_id) throw new Error("LAB_MISMATCH");
    const clientRequestId = data.clientRequestId?.trim().slice(0, 64) || null;
    if (clientRequestId) {
      const existing = await sql<{ id: string; patient_name: string; status: "draft" }>`
        select r.id, p.full_name as patient_name, r.status
        from reports r inner join patients p on p.id = r.patient_id
        where r.lab_id = ${lab_id} and r.client_request_id = ${clientRequestId}
        limit 1
      `;
      if (existing.length) return { id: existing[0].id, patientName: existing[0].patient_name, status: "draft" as const };
    }
    const patientName = data.patientName.trim();
    const age = Number(data.age);
    const ageUnit = parseAgeUnit(data.ageUnit);
    const ageYears = ageToYears(age, ageUnit) ?? 0; // range logic works in fractional years
    if (patientName.length < 2) throw new Error("اسم المريض غير صالح");
    const ageIssue = ageProblem(age, ageUnit);
    if (ageIssue) throw new Error(ageIssue);
    if (data.gender !== "ذكر" && data.gender !== "أنثى") throw new Error("النوع غير صالح");
    if (!isValidPhone(data.phone)) throw new Error("رقم هاتف المريض مطلوب (10 أرقام على الأقل)");

    const entered = data.tests.filter((t) => t.value.trim());
    if (!entered.length) throw new Error("أدخل نتيجة تحليل واحدة على الأقل");

    const catalogRows = await sql<{ test_name: string; unit: string; male_range: string; female_range: string; age_ranges: string | null; category_id: string; category_name_ar: string; category_name_en: string }>`
      select test_name, unit, male_range, female_range, age_ranges, category_id, category_name_ar, category_name_en
      from lab_test_catalog
      where lab_id = ${lab_id} and is_active = true
    `;
    const catalogMap = new Map(catalogRows.map((row) => [`${row.category_id}:${row.test_name}`, row]));
    for (const test of entered) {
      if (!catalogMap.has(`${test.categoryId}:${test.name}`)) throw new Error(`التحليل غير متاح في كتالوج المعمل: ${test.name}`);
    }
    const catalogTests = entered.map((test) => {
      const row = catalogMap.get(`${test.categoryId}:${test.name}`)!;
      return {
        ...test,
        categoryId: row.category_id,
        categoryAr: row.category_name_ar,
        categoryEn: row.category_name_en,
        unit: row.unit,
        customRange: resolveRange(row, test, data.gender, ageYears) || test.customRange,
      };
    });
    const tests = addCalculatedTests(catalogTests, data.gender, ageYears);
    const patientId = randomUUID();
    const reportId = randomUUID();
    const now = effectiveCreatedAt(data.clientCreatedAt);
    const dateKey = now.toISOString().slice(0, 10).replaceAll("-", "");
    const patientCode = data.patientCode?.trim() || `P-${dateKey}-${randomUUID().slice(0, 4).toUpperCase()}`;
    const sampleId = `S-${dateKey}-${randomUUID().slice(0, 6).toUpperCase()}`;

    await sql.query(
      `insert into patients (id, lab_id, patient_code, full_name, age, age_unit, gender, phone, national_id, notes)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [patientId, lab_id, patientCode, patientName, age, ageUnit, data.gender, phoneDigits(data.phone), data.nationalId?.trim() || null, data.notes?.trim() || null],
    );

    await sql.query(
      `insert into reports (id, lab_id, patient_id, sample_id, referring_doctor, status, notes, collected_at, created_by, created_at, client_request_id)
       values ($1,$2,$3,$4,$5,'draft',$6,$7,$8,$9,$10)`,
      [reportId, lab_id, patientId, sampleId, data.doctor?.trim() || "Himself", data.notes?.trim() || null, data.collectedAt || null, lab_user_id, now.toISOString(), clientRequestId],
    );

    for (let i = 0; i < tests.length; i += 1) {
      const test = tests[i];
      const interpretation = interpretResult(test.name, test.value, data.gender, test.customRange, ageYears, test.categoryId);
      const critical = isCritical(test.name, test.value);
      const flag = critical ? "critical" : interpretation.flag === "unknown" ? "abnormal" : interpretation.flag;
      await sql.query(
        `insert into report_results
          (id, report_id, test_id, test_name, category_id, category_ar, category_en,
           result_value, unit, reference_range, flag, interpretation, sort_order)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
        [
          randomUUID(), reportId, `${test.categoryId}:${test.name}`, test.name,
          test.categoryId, test.categoryAr, test.categoryEn, test.value, test.unit || null,
          test.customRange?.trim() || getNormalRange(test.name, data.gender, ageYears, test.categoryId), flag,
          interpretation.note, i,
        ],
      );
    }

    await sql.query(
      `insert into audit_logs (id, lab_id, actor_user_id, actor_auth_user_id, action, entity_type, entity_id)
       values ($1,$2,$3,$4,$5,$6,$7)`,
      [randomUUID(), lab_id, lab_user_id, context.userId, "report.created", "report", reportId],
    );

    return { id: reportId, patientName, status: "draft" as const };
  });

export type LabReport = {
  id: string;
  patientName: string;
  patientCode: string;
  age: number;
  ageUnit?: AgeUnit;
  gender: "ذكر" | "أنثى";
  phone?: string;
  nationalId?: string;
  sampleId: string;
  doctor: string;
  createdAt: string;
  collectedAt?: string;
  tests: DraftTest[];
  notes?: string;
  status: "draft" | "pending_review" | "approved" | "cancelled";
  reviewedBy?: string;
  approvedAt?: string;
};


export const updateLabReport = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context, data }: { context: { userId: string }; data: CreateLabReportInput & { id: string } }) => {
    const { sql, lab_user_id, lab_id } = await getLabContext(context.userId, "reports.edit");

    const current = await sql<{ id: string; patient_id: string; status: "draft" | "pending_review" | "approved" | "cancelled" }>`
      select id, patient_id, status from reports where id = ${data.id} and lab_id = ${lab_id} limit 1
    `;
    if (!current.length) throw new Error("REPORT_NOT_FOUND");
    if (current[0].status !== "draft") throw new Error("REPORT_NOT_EDITABLE");

    const patientName = data.patientName.trim();
    const age = Number(data.age);
    const ageUnit = parseAgeUnit(data.ageUnit);
    const ageYears = ageToYears(age, ageUnit) ?? 0; // range logic works in fractional years
    if (patientName.length < 2) throw new Error("اسم المريض غير صالح");
    const ageIssue = ageProblem(age, ageUnit);
    if (ageIssue) throw new Error(ageIssue);
    if (data.gender !== "ذكر" && data.gender !== "أنثى") throw new Error("النوع غير صالح");
    if (!isValidPhone(data.phone)) throw new Error("رقم هاتف المريض مطلوب (10 أرقام على الأقل)");
    const entered = data.tests.filter((t) => t.value.trim());
    if (!entered.length) throw new Error("أدخل نتيجة تحليل واحدة على الأقل");

    const catalogRows = await sql<{ test_name: string; unit: string; male_range: string; female_range: string; age_ranges: string | null; category_id: string; category_name_ar: string; category_name_en: string }>`
      select test_name, unit, male_range, female_range, age_ranges, category_id, category_name_ar, category_name_en
      from lab_test_catalog where lab_id = ${lab_id} and is_active = true
    `;
    const catalogMap = new Map(catalogRows.map((row) => [`${row.category_id}:${row.test_name}`, row]));
    for (const test of entered) if (!catalogMap.has(`${test.categoryId}:${test.name}`)) throw new Error(`التحليل غير متاح في كتالوج المعمل: ${test.name}`);
    const catalogTests = entered.map((test) => {
      const row = catalogMap.get(`${test.categoryId}:${test.name}`)!;
      return { ...test, categoryId: row.category_id, categoryAr: row.category_name_ar, categoryEn: row.category_name_en, unit: row.unit, customRange: resolveRange(row, test, data.gender, ageYears) || test.customRange };
    });
    const tests = addCalculatedTests(catalogTests, data.gender, ageYears);

    await sql.query(
      `update patients set patient_code=$1, full_name=$2, age=$3, age_unit=$4, gender=$5, phone=$6, national_id=coalesce($7, national_id), notes=$8, updated_at=current_timestamp where id=$9 and lab_id=$10`,
      [data.patientCode?.trim() || null, patientName, age, ageUnit, data.gender, phoneDigits(data.phone), data.nationalId?.trim() || null, data.notes?.trim() || null, current[0].patient_id, lab_id],
    );
    await sql.query(
      `update reports set referring_doctor=$1, notes=$2, collected_at=$3, updated_at=current_timestamp where id=$4 and lab_id=$5 and status='draft'`,
      [data.doctor?.trim() || "Himself", data.notes?.trim() || null, data.collectedAt || null, data.id, lab_id],
    );
    await sql.query(`delete from report_results where report_id=$1`, [data.id]);
    for (let i = 0; i < tests.length; i += 1) {
      const test = tests[i];
      const interpretation = interpretResult(test.name, test.value, data.gender, test.customRange, ageYears, test.categoryId);
      const critical = isCritical(test.name, test.value);
      const flag = critical ? "critical" : interpretation.flag === "unknown" ? "abnormal" : interpretation.flag;
      await sql.query(
        `insert into report_results (id, report_id, test_id, test_name, category_id, category_ar, category_en, result_value, unit, reference_range, flag, interpretation, sort_order) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
        [randomUUID(), data.id, `${test.categoryId}:${test.name}`, test.name, test.categoryId, test.categoryAr, test.categoryEn, test.value, test.unit || null, test.customRange?.trim() || getNormalRange(test.name, data.gender, ageYears, test.categoryId), flag, interpretation.note, i],
      );
    }
    await sql.query(
      `insert into audit_logs (id, lab_id, actor_user_id, actor_auth_user_id, action, entity_type, entity_id) values ($1,$2,$3,$4,$5,$6,$7)`,
      [randomUUID(), lab_id, lab_user_id, context.userId, "report.updated", "report", data.id],
    );
    return { id: data.id, patientName, status: "draft" as const };
  });

export const listLabReports = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { sql, lab_id } = await getLabContext(context.userId, "reports.view");
    const rows = await sql<{
      id: string; patient_code: string | null; full_name: string; age: number; age_unit: string | null; gender: "ذكر" | "أنثى"; phone: string | null; national_id: string | null;
      sample_id: string | null; referring_doctor: string | null; created_at: string | Date; notes: string | null; collected_at: string | Date | null;
      status: "draft" | "pending_review" | "approved" | "cancelled"; reviewed_by: string | null; approved_at: string | Date | null;
    }>`
      select r.id, p.patient_code, p.full_name, p.age, p.age_unit, p.gender, p.phone, p.national_id,
             r.sample_id, r.referring_doctor, r.created_at, r.notes, r.collected_at, r.status, r.reviewed_by, r.approved_at
      from reports r
      inner join patients p on p.id = r.patient_id and p.lab_id = r.lab_id
      where r.lab_id = ${lab_id}
      order by r.created_at desc
    `;
    // The archive needs "how many tests / how many flagged / any critical" per report.
    // Aggregate in SQL from the stored flags instead of shipping every result row.
    const counts = await sql<{ report_id: string; total: number; flagged: number; critical: number }>`
      select rr.report_id,
             count(*)::int as total,
             count(*) filter (where rr.flag in ('high', 'low', 'abnormal'))::int as flagged,
             count(*) filter (where rr.flag = 'critical')::int as critical
      from report_results rr
      inner join reports r on r.id = rr.report_id
      where r.lab_id = ${lab_id}
      group by rr.report_id
    `;
    const byReport = new Map(counts.map((c) => [c.report_id, c]));
    return rows.map((r) => {
      const c = byReport.get(r.id);
      return {
        id: r.id, patientName: r.full_name, patientCode: r.patient_code || "", age: Number(r.age), ageUnit: parseAgeUnit(r.age_unit), gender: r.gender,
        phone: r.phone || undefined, nationalId: r.national_id || undefined, sampleId: r.sample_id || "",
        doctor: r.referring_doctor || "Himself", createdAt: String(r.created_at), collectedAt: r.collected_at ? String(r.collected_at).slice(0, 10) : undefined,
        tests: [], notes: r.notes || undefined,
        status: r.status, reviewedBy: r.reviewed_by || undefined, approvedAt: r.approved_at ? String(r.approved_at) : undefined,
        testCount: Number(c?.total ?? 0), flaggedCount: Number(c?.flagged ?? 0), criticalCount: Number(c?.critical ?? 0),
      };
    });
  });

export type RecentReport = {
  id: string;
  patientName: string;
  age: number;
  ageUnit?: AgeUnit;
  gender: "ذكر" | "أنثى";
  status: "draft" | "pending_review" | "approved" | "cancelled";
  createdAt: string;
  criticalCount: number;
  flaggedCount: number;
};

/** The latest few reports, for the home screen. Cheap: LIMIT in SQL, one aggregate over just those rows. */
export const getRecentLabReports = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<RecentReport[]> => {
    const { sql, lab_id } = await getLabContext(context.userId, "reports.view");
    const rows = await sql<{
      id: string; full_name: string; age: number; age_unit: string | null; gender: "ذكر" | "أنثى";
      status: RecentReport["status"]; created_at: string | Date; total: number; flagged: number; critical: number;
    }>`
      select r.id, p.full_name, p.age, p.age_unit, p.gender, r.status, r.created_at,
             (select count(*)::int from report_results rr where rr.report_id = r.id) as total,
             (select count(*)::int from report_results rr where rr.report_id = r.id and rr.flag in ('high', 'low', 'abnormal')) as flagged,
             (select count(*)::int from report_results rr where rr.report_id = r.id and rr.flag = 'critical') as critical
      from reports r
      inner join patients p on p.id = r.patient_id and p.lab_id = r.lab_id
      where r.lab_id = ${lab_id} and r.status <> 'cancelled'
      order by r.created_at desc
      limit 5
    `;
    return rows.map((r) => ({
      id: r.id, patientName: r.full_name, age: Number(r.age), ageUnit: parseAgeUnit(r.age_unit), gender: r.gender, status: r.status,
      createdAt: String(r.created_at), criticalCount: Number(r.critical), flaggedCount: Number(r.flagged),
    }));
  });

export const getLabReport = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context, data }: { context: { userId: string }; data: { id: string } }) => {
    const { sql, lab_id } = await getLabContext(context.userId, "reports.view");
    const rows = await sql<{
      id: string; patient_code: string | null; full_name: string; age: number; age_unit: string | null; gender: "ذكر" | "أنثى"; phone: string | null; national_id: string | null;
      sample_id: string | null; referring_doctor: string | null; created_at: string | Date; notes: string | null; collected_at: string | Date | null;
      status: "draft" | "pending_review" | "approved" | "cancelled"; reviewed_by: string | null; approved_at: string | Date | null;
    }>`
      select r.id, p.patient_code, p.full_name, p.age, p.age_unit, p.gender, p.phone, p.national_id,
             r.sample_id, r.referring_doctor, r.created_at, r.notes, r.collected_at, r.status, r.reviewed_by, r.approved_at
      from reports r
      inner join patients p on p.id = r.patient_id and p.lab_id = r.lab_id
      where r.id = ${data.id} and r.lab_id = ${lab_id}
      limit 1
    `;
    if (!rows.length) return null;
    const results = await sql<{
      test_name: string; category_id: string | null; category_ar: string | null; category_en: string | null;
      result_value: string | null; unit: string | null; reference_range: string | null;
    }>`
      select test_name, category_id, category_ar, category_en, result_value, unit, reference_range
      from report_results
      where report_id = ${data.id}
      order by sort_order, test_name
    `;
    const r = rows[0];
    return {
      id: r.id, patientName: r.full_name, patientCode: r.patient_code || "", age: Number(r.age), ageUnit: parseAgeUnit(r.age_unit), gender: r.gender,
      phone: r.phone || undefined, nationalId: r.national_id || undefined, sampleId: r.sample_id || "",
      doctor: r.referring_doctor || "Himself", createdAt: String(r.created_at), collectedAt: r.collected_at ? String(r.collected_at).slice(0, 10) : undefined,
      notes: r.notes || undefined,
      status: r.status, reviewedBy: r.reviewed_by || undefined, approvedAt: r.approved_at ? String(r.approved_at) : undefined,
      tests: results.map((t) => ({
        name: t.test_name, categoryId: t.category_id || "", categoryAr: t.category_ar || "",
        categoryEn: t.category_en || "", value: t.result_value || "", unit: t.unit || "",
        customRange: t.reference_range || undefined,
      })),
    } satisfies LabReport;
  });


export async function getReportForAction(userId: string, reportId: string, permission?: LabPermission) {
  const { sql, lab_user_id, lab_id, role } = await getLabContext(userId, permission);
  const rows = await sql<{ id: string; status: "draft" | "pending_review" | "approved" | "cancelled" }>`
    select id, status from reports where id = ${reportId} and lab_id = ${lab_id} limit 1
  `;
  if (!rows.length) throw new Error("REPORT_NOT_FOUND");
  return { sql, lab_user_id, lab_id, role, report: rows[0] };
}

export const submitLabReportForReview = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context, data }: { context: { userId: string }; data: { id: string } }) => {
    const { sql, lab_user_id, lab_id, report } = await getReportForAction(context.userId, data.id, "reports.edit");
    if (report.status !== "draft") throw new Error("REPORT_NOT_DRAFT");
    await sql.query(`update reports set status='pending_review', updated_at=current_timestamp where id=$1 and lab_id=$2`, [data.id, lab_id]);
    await sql.query(
      `insert into audit_logs (id, lab_id, actor_user_id, actor_auth_user_id, action, entity_type, entity_id) values ($1,$2,$3,$4,$5,$6,$7)`,
      [randomUUID(), lab_id, lab_user_id, context.userId, "report.submitted_for_review", "report", data.id],
    );
    return { ok: true, status: "pending_review" as const };
  });

export const approveLabReport = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context, data }: { context: { userId: string }; data: { id: string } }) => {
    const { sql, lab_user_id, lab_id, report } = await getReportForAction(context.userId, data.id, "reports.approve");
    if (!["pending_review", "draft"].includes(report.status)) throw new Error("REPORT_NOT_REVIEWABLE");
    await sql.query(
      `update reports set status='approved', reviewed_by=$1, approved_at=current_timestamp, updated_at=current_timestamp where id=$2 and lab_id=$3`,
      [lab_user_id, data.id, lab_id],
    );
    await sql.query(
      `insert into audit_logs (id, lab_id, actor_user_id, actor_auth_user_id, action, entity_type, entity_id) values ($1,$2,$3,$4,$5,$6,$7)`,
      [randomUUID(), lab_id, lab_user_id, context.userId, "report.approved", "report", data.id],
    );
    return { ok: true, status: "approved" as const };
  });

export const deleteLabReport = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context, data }: { context: { userId: string }; data: { id: string } }) => {
    const { sql, lab_user_id, lab_id, role, report } = await getReportForAction(context.userId, data.id, "reports.delete");
    // التقرير المعتمد وثيقة نهائية: مالك المعمل بس هو اللي يقدر يحذفه.
    if (report.status === "approved" && role !== "owner") throw new Error("APPROVED_REPORT_CANNOT_BE_DELETED");

    const patientRows = await sql<{ patient_id: string }>`
      select patient_id from reports where id = ${data.id} and lab_id = ${lab_id} limit 1
    `;
    const patientId = patientRows[0]?.patient_id;

    await sql.query(`delete from reports where id=$1 and lab_id=$2`, [data.id, lab_id]);

    // احذف المريض بس لو مالوش أي تقرير تاني مرتبط بيه.
    if (patientId) {
      const otherReports = await sql<{ id: string }>`
        select id from reports where patient_id = ${patientId} and lab_id = ${lab_id} limit 1
      `;
      if (!otherReports.length) {
        await sql.query(`delete from patients where id=$1 and lab_id=$2`, [patientId, lab_id]);
      }
    }

    await sql.query(
      `insert into audit_logs (id, lab_id, actor_user_id, actor_auth_user_id, action, entity_type, entity_id) values ($1,$2,$3,$4,$5,$6,$7)`,
      [randomUUID(), lab_id, lab_user_id, context.userId, report.status === "approved" ? "report.approved_deleted" : "report.deleted", "report", data.id],
    );
    return { ok: true };
  });

export type PreviousResults = {
  reportDate: string;
  /** Keyed by "categoryId:testName" — plain names collide ("Color", "Blood", "RBCs"). */
  values: Record<string, string>;
};

/**
 * The patient's latest earlier APPROVED report, to show the trend between visits.
 *
 * Every new report creates its own patient row, so matching on patient_id alone
 * almost never finds a previous visit. The same person is recognised by, in
 * order: the same patient row, the same national id, or the same phone + name
 * (Arabic-folded, so "احمد" = "أحمد").
 */
export const getPreviousResults = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context, data }: { context: { userId: string }; data: { reportId: string } }): Promise<PreviousResults | null> => {
    const { sql, lab_id } = await getLabContext(context.userId, "reports.view");

    const current = await sql<{ patient_id: string; created_at: string | Date; full_name: string; national_id: string | null; phone: string | null }>`
      select r.patient_id, r.created_at, p.full_name, p.national_id, p.phone
      from reports r inner join patients p on p.id = r.patient_id and p.lab_id = r.lab_id
      where r.id = ${data.reportId} and r.lab_id = ${lab_id} limit 1
    `;
    if (!current.length) return null;

    const nationalId = (current[0].national_id ?? "").trim();
    const phone = (current[0].phone ?? "").trim();
    const foldedName = normalizeSearch(current[0].full_name);
    const foldFrom = SQL_FOLD_FROM;
    const foldTo = SQL_FOLD_TO;

    const previous = await sql<{ id: string; created_at: string | Date }>`
      select r.id, r.created_at
      from reports r inner join patients p on p.id = r.patient_id and p.lab_id = r.lab_id
      where r.lab_id = ${lab_id}
        and r.id <> ${data.reportId}
        and r.status = 'approved'
        and r.created_at < ${current[0].created_at}
        and (
          r.patient_id = ${current[0].patient_id}
          or (${nationalId} <> '' and coalesce(p.national_id, '') = ${nationalId})
          or (${phone} <> '' and coalesce(p.phone, '') = ${phone}
              and translate(lower(p.full_name), ${foldFrom}, ${foldTo}) = ${foldedName})
        )
      order by r.created_at desc
      limit 1
    `;
    if (!previous.length) return null;

    const results = await sql<{ key: string; result_value: string | null }>`
      select category_id || ':' || test_name as key, result_value
      from report_results where report_id = ${previous[0].id}
    `;
    const values: Record<string, string> = {};
    for (const r of results) if (r.result_value) values[r.key] = r.result_value;

    return { reportDate: String(previous[0].created_at), values };
  });
