import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { requireLabPermission, type LabPermission } from "@/lib/lab-users";

async function currentLab(userId: string, permission?: LabPermission) {
  const sql = await getSql();
  const rows = await sql<{ lab_id: string }>`
    select lu.lab_id
    from lab_users lu
    inner join labs l on l.id = lu.lab_id
    where lu.auth_user_id = ${userId} and lu.is_active = true and l.is_active = true
    limit 1
  `;

  if (!rows.length) throw new Error("LAB_ACCESS_REQUIRED");
  if (permission) await requireLabPermission(userId, permission);

  return { sql, labId: rows[0].lab_id };
}

export type PatientSummary = {
  id: string;
  patientCode: string;
  fullName: string;
  age: number;
  gender: "ذكر" | "أنثى";
  phone?: string;
  nationalId?: string;
  reportCount: number;
  lastReportAt?: string;
};

export const searchLabPatients = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(
    async ({
      context,
      data,
    }: {
      context: { userId: string };
      data: { query?: string };
    }) => {
      const { sql, labId } = await currentLab(context.userId, "patients.view");

      const query = (data.query || "").trim();

      if (query.length < 2) {
        return [] as PatientSummary[];
      }

      const like = `%${query}%`;

      const rows = await sql<{
        id: string;
        patient_code: string | null;
        full_name: string;
        age: number | null;
        gender: "ذكر" | "أنثى";
        phone: string | null;
        national_id: string | null;
        report_count: number;
        last_report_at: string | Date | null;
      }>`
        select
          p.id,
          p.patient_code,
          p.full_name,
          p.age,
          p.gender,
          p.phone,
          p.national_id,
          count(r.id)::int as report_count,
          max(r.created_at) as last_report_at
        from patients p
        left join reports r
          on r.patient_id = p.id
          and r.lab_id = p.lab_id
        where p.lab_id = ${labId}
          and (
            p.full_name ilike ${like}
            or coalesce(p.patient_code, '') ilike ${like}
            or coalesce(p.phone, '') ilike ${like}
            or coalesce(p.national_id, '') ilike ${like}
          )
        group by p.id
        order by max(r.created_at) desc nulls last, p.full_name asc
        limit 12
      `;

      return rows.map((p) => ({
        id: p.id,
        patientCode: p.patient_code || "",
        fullName: p.full_name,
        age: Number(p.age || 0),
        gender: p.gender,
        phone: p.phone || undefined,
        nationalId: p.national_id || undefined,
        reportCount: Number(p.report_count || 0),
        lastReportAt: p.last_report_at
          ? String(p.last_report_at)
          : undefined,
      }));
    },
  );

export type CreatePatientInput = {
  patientCode?: string;
  fullName: string;
  age: number;
  gender: "ذكر" | "أنثى";
  phone?: string;
  nationalId?: string;
  notes?: string;
};

export const createPatient = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(
    async ({
      context,
      data,
    }: {
      context: { userId: string };
      data: CreatePatientInput;
    }) => {
      const { sql, labId } = await currentLab(context.userId, "patients.create");

      const fullName = data.fullName.trim();
      const age = Number(data.age);

      if (fullName.length < 2) {
        throw new Error("اسم المريض غير صالح");
      }

      if (!Number.isInteger(age) || age <= 0 || age > 130) {
        throw new Error("السن غير صالح");
      }

      if (data.gender !== "ذكر" && data.gender !== "أنثى") {
        throw new Error("النوع غير صالح");
      }

      const patientCode =
        data.patientCode?.trim().toUpperCase() || null;

      if (patientCode) {
        const duplicate = await sql<{ id: string }>`
          select id
          from patients
          where lab_id = ${labId}
            and patient_code = ${patientCode}
          limit 1
        `;

        if (duplicate.length) {
          throw new Error(
            "كود المريض مستخدم بالفعل في هذا المعمل",
          );
        }
      }

      const id = crypto.randomUUID();

      await sql.query(
        `insert into patients
        (
          id,
          lab_id,
          patient_code,
          full_name,
          age,
          gender,
          phone,
          national_id,
          notes
        )
        values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [
          id,
          labId,
          patientCode,
          fullName,
          age,
          data.gender,
          data.phone?.trim() || null,
          data.nationalId?.trim() || null,
          data.notes?.trim() || null,
        ],
      );

      const actor = await sql<{ id: string }>`
        select id
        from lab_users
        where auth_user_id = ${context.userId}
          and lab_id = ${labId}
        limit 1
      `;

      await sql.query(
        `insert into audit_logs
        (
          id,
          lab_id,
          actor_user_id,
          actor_auth_user_id,
          action,
          entity_type,
          entity_id
        )
        values ($1,$2,$3,$4,$5,$6,$7)`,
        [
          crypto.randomUUID(),
          labId,
          actor[0]?.id || null,
          context.userId,
          "patient.created",
          "patient",
          id,
        ],
      );

      return {
        id,
        patientCode: patientCode || "",
        fullName,
        age,
        gender: data.gender,
      };
    },
  );

export const getPatientReports = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(
    async ({
      context,
      data,
    }: {
      context: { userId: string };
      data: { patientId: string };
    }) => {
      const { sql, labId } = await currentLab(context.userId, "patients.view");

      return await sql<{
        id: string;
        sample_id: string | null;
        status: string;
        created_at: string | Date;
      }>`
        select
          r.id,
          r.sample_id,
          r.status,
          r.created_at
        from reports r
        inner join patients p
          on p.id = r.patient_id
          and p.lab_id = r.lab_id
        where r.patient_id = ${data.patientId}
          and r.lab_id = ${labId}
        order by r.created_at desc
        limit 30
      `;
    },
  );
