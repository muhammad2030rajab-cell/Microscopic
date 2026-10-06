import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { normalizeAsset, normalizeDesign, type ReportDesign, type ReportDesignAssets } from "@/lib/report-design";

async function getLabUser(userId: string) {
  const sql = await getSql();
  const rows = await sql<{ id: string; lab_id: string; role: string }>`
    select lu.id, lu.lab_id, lu.role from lab_users lu
    inner join labs l on l.id = lu.lab_id
    where lu.auth_user_id = ${userId} and lu.is_active = true and l.is_active = true
    limit 1
  `;
  if (!rows.length) throw new Error("LAB_ACCESS_REQUIRED");
  return { sql, ...rows[0] };
}

/** Signature + stamp images. Kept out of getCurrentLab (it runs on every page) and fetched by the report/settings pages only. */
export const getReportDesignAssets = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<ReportDesignAssets> => {
    const { sql, lab_id } = await getLabUser(context.userId);
    const rows = await sql<{ signature_url: string | null; stamp_url: string | null }>`
      select report_design ->> 'signatureUrl' as signature_url, report_design ->> 'stampUrl' as stamp_url
      from labs where id = ${lab_id} limit 1
    `;
    return { signatureUrl: normalizeAsset(rows[0]?.signature_url), stampUrl: normalizeAsset(rows[0]?.stamp_url) };
  });

export type UpdateReportDesignInput = {
  design: ReportDesign;
  /** undefined = keep what is stored, null = remove, string = replace. */
  signatureUrl?: string | null;
  stampUrl?: string | null;
};

export const updateReportDesign = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context, data }: { context: { userId: string }; data: UpdateReportDesignInput }) => {
    const { sql, id, lab_id, role } = await getLabUser(context.userId);
    if (role !== "owner") throw new Error("OWNER_ACCESS_REQUIRED");

    const design = normalizeDesign(data.design);

    const current = await sql<{ signature_url: string | null; stamp_url: string | null }>`
      select report_design ->> 'signatureUrl' as signature_url, report_design ->> 'stampUrl' as stamp_url
      from labs where id = ${lab_id} limit 1
    `;
    const resolveAsset = (incoming: string | null | undefined, stored: string | null | undefined, label: string) => {
      if (incoming === undefined) return normalizeAsset(stored);
      if (incoming === null || incoming === "") return null;
      const ok = normalizeAsset(incoming);
      if (!ok) throw new Error(`${label}: لازم صورة PNG أو JPG أو WebP حجمها صغير`);
      return ok;
    };
    const signatureUrl = resolveAsset(data.signatureUrl, current[0]?.signature_url, "التوقيع");
    const stampUrl = resolveAsset(data.stampUrl, current[0]?.stamp_url, "الختم");

    await sql.query(`update labs set report_design = $1::jsonb, updated_at = current_timestamp where id = $2`, [
      JSON.stringify({ ...design, signatureUrl, stampUrl }),
      lab_id,
    ]);
    await logAudit(sql, { labId: lab_id, actorUserId: id, actorAuthUserId: context.userId, action: "lab.report_design_updated", entityType: "lab", entityId: lab_id });
    return { design, signatureUrl, stampUrl };
  });

export type ReportLanguageSetting = "bilingual" | "ar" | "en";

/** Owner-only: the language every printed report of this lab uses by default (labs.report_language). */
export const setReportLanguage = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context, data }: { context: { userId: string }; data: { language: ReportLanguageSetting } }) => {
    const { sql, id, lab_id, role } = await getLabUser(context.userId);
    if (role !== "owner") throw new Error("OWNER_ACCESS_REQUIRED");
    if (!["bilingual", "ar", "en"].includes(data.language)) throw new Error("لغة غير معروفة");
    await sql.query(`update labs set report_language = $1, updated_at = current_timestamp where id = $2`, [data.language, lab_id]);
    await logAudit(sql, { labId: lab_id, actorUserId: id, actorAuthUserId: context.userId, action: "lab.report_language_set", entityType: "lab", entityId: lab_id });
    return { language: data.language };
  });
