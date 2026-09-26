import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";

export type CurrentAccess =
  | { type: "admin"; userId: string; name: string | null; email: string | null }
  | { type: "lab"; userId: string; labId: string; labName: string; username: string; role: string }
  | { type: "none" };

export const getCurrentAccess = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<CurrentAccess> => {
    const sql = await getSql();

    const admin = await sql<{ id: string; name: string | null; email: string | null }>`
      select u.id, u.name, u.email
      from "user" u
      inner join platform_admins pa on pa.auth_user_id = u.id
      where u.id = ${context.userId}
      limit 1
    `;

    if (admin.length) {
      return {
        type: "admin",
        userId: context.userId,
        name: admin[0].name,
        email: admin[0].email,
      };
    }

    const lab = await sql<{
      lab_id: string;
      lab_name: string;
      username: string;
      role: string;
    }>`
      select lu.lab_id, l.name as lab_name, lu.username, lu.role
      from lab_users lu
      inner join labs l on l.id = lu.lab_id
      where lu.auth_user_id = ${context.userId}
        and lu.is_active = true
        and l.is_active = true
      limit 1
    `;

    if (lab.length) {
      return {
        type: "lab",
        userId: context.userId,
        labId: lab[0].lab_id,
        labName: lab[0].lab_name,
        username: lab[0].username,
        role: lab[0].role,
      };
    }

    return { type: "none" };
  });

export type LabProfileData = {
  lab_id: string;
  lab_name: string;
  lab_name_en: string | null;
  username: string;
  role: string;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  website: string | null;
  address: string | null;
  doctor_name: string | null;
  doctor_degree: string | null;
  doctor_specialty: string | null;
  is_profile_complete: boolean;
};

export const getCurrentLab = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<LabProfileData> => {
    const sql = await getSql();
    const rows = await sql<LabProfileData>`
      select l.id as lab_id, l.name as lab_name, l.name_en as lab_name_en,
             lu.username, lu.role, l.phone, l.whatsapp, l.email, l.website,
             l.address, l.doctor_name, l.doctor_degree, l.doctor_specialty,
             (length(trim(coalesce(l.name, ''))) >= 2
              and length(trim(coalesce(l.phone, ''))) >= 5
              and length(trim(coalesce(l.address, ''))) >= 5) as is_profile_complete
      from lab_users lu
      inner join labs l on l.id = lu.lab_id
      where lu.auth_user_id = ${context.userId}
        and lu.is_active = true
        and l.is_active = true
      limit 1
    `;

    if (!rows.length) throw new Error("LAB_ACCESS_REQUIRED");
    return rows[0];
  });

export type UpdateLabProfileInput = {
  name: string;
  nameEn?: string;
  phone?: string;
  whatsapp?: string;
  email?: string;
  website?: string;
  address?: string;
  doctorName?: string;
  doctorDegree?: string;
  doctorSpecialty?: string;
};

export const updateCurrentLabProfile = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context, data }: { context: { userId: string }; data: UpdateLabProfileInput }) => {
    const sql = await getSql();
    const name = data.name.trim();
    if (name.length < 2) throw new Error("اسم المعمل غير صالح");

    const rows = await sql<{ lab_id: string; role: string }>`
      select lab_id, role
      from lab_users
      where auth_user_id = ${context.userId}
        and is_active = true
      limit 1
    `;
    if (!rows.length) throw new Error("LAB_ACCESS_REQUIRED");
    if (rows[0].role !== "owner") throw new Error("OWNER_ACCESS_REQUIRED");

    await sql.query(
      `update labs
       set name=$1, name_en=$2, phone=$3, whatsapp=$4, email=$5, website=$6,
           address=$7, doctor_name=$8, doctor_degree=$9, doctor_specialty=$10,
           updated_at=current_timestamp
       where id=$11`,
      [
        name,
        data.nameEn?.trim() || null,
        data.phone?.trim() || null,
        data.whatsapp?.trim() || null,
        data.email?.trim() || null,
        data.website?.trim() || null,
        data.address?.trim() || null,
        data.doctorName?.trim() || null,
        data.doctorDegree?.trim() || null,
        data.doctorSpecialty?.trim() || null,
        rows[0].lab_id,
      ],
    );

    return { ok: true };
  });

export type LabDashboardStats = {
  patients: number;
  reportsToday: number;
  pendingReview: number;
  approved: number;
  critical: number;
};

export const getLabDashboardStats = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<LabDashboardStats> => {
    const sql = await getSql();
    const lab = await sql<{ lab_id: string }>`
      select lu.lab_id
      from lab_users lu
      inner join labs l on l.id = lu.lab_id
      where lu.auth_user_id = ${context.userId}
        and lu.is_active = true
        and l.is_active = true
      limit 1
    `;
    if (!lab.length) throw new Error("LAB_ACCESS_REQUIRED");
    const labId = lab[0].lab_id;

    const rows = await sql<LabDashboardStats>`
      select
        (select count(*)::int from patients where lab_id = ${labId}) as patients,
        (select count(*)::int from reports where lab_id = ${labId} and created_at::date = current_date) as "reportsToday",
        (select count(*)::int from reports where lab_id = ${labId} and status = 'pending_review') as "pendingReview",
        (select count(*)::int from reports where lab_id = ${labId} and status = 'approved') as approved,
        (select count(*)::int from report_results rr inner join reports r on r.id = rr.report_id where r.lab_id = ${labId} and rr.flag = 'critical') as critical
    `;
    return rows[0] ?? { patients: 0, reportsToday: 0, pendingReview: 0, approved: 0, critical: 0 };
  });
