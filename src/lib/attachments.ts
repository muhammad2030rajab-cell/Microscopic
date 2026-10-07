import { createServerFn } from "@tanstack/react-start";
import { randomUUID } from "node:crypto";
import { authMiddleware } from "@/lib/auth/middleware";
import { getReportForAction } from "@/lib/lab-reports";
import { logAudit } from "@/lib/audit";
import { env } from "@/lib/env.server";
import { assertLabFeature } from "@/lib/lab-features";
import { isLocalAttachmentUrl, localAttachmentUrl, localFileKey } from "@/lib/local-files";

export type ReportAttachment = {
  id: string;
  fileName: string;
  url: string;
  contentType: string | null;
  sizeBytes: number | null;
  createdAt: string;
};

const MAX_FILE_BYTES = 4 * 1024 * 1024; // 4MB — كافٍ لصور سكانر عادية، وأمان لحجم الطلب على Vercel.

function blobConfigured() {
  return Boolean(env("BLOB_READ_WRITE_TOKEN"));
}

export const listReportAttachments = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context, data }: { context: { userId: string }; data: { reportId: string } }): Promise<ReportAttachment[]> => {
    const { sql, lab_id } = await getReportForAction(context.userId, data.reportId, "reports.view");
    const rows = await sql<{
      id: string; file_name: string; url: string; content_type: string | null; size_bytes: number | null; created_at: string | Date;
    }>`
      select id, file_name, url, content_type, size_bytes, created_at
      from report_attachments
      where report_id = ${data.reportId} and lab_id = ${lab_id}
      order by created_at asc
    `;
    return rows.map((r) => ({
      id: r.id, fileName: r.file_name, url: r.url, contentType: r.content_type, sizeBytes: r.size_bytes, createdAt: String(r.created_at),
    }));
  });

export const uploadReportAttachment = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context, data }: {
    context: { userId: string };
    data: { reportId: string; fileName: string; contentType: string; base64: string };
  }): Promise<ReportAttachment> => {
    // On the lab PC (local program) files are kept in its data folder; on the cloud they go to Vercel Blob.
    const files = await import("@/lib/local-files.server");
    const useLocal = files.localFilesRoot() !== null;
    if (!useLocal && !blobConfigured()) throw new Error("خدمة التخزين (Vercel Blob) غير مفعّلة على هذا المشروع بعد");
    const { sql, lab_id, lab_user_id } = await getReportForAction(context.userId, data.reportId, "reports.edit");
    await assertLabFeature(sql, lab_id, "attachments");

    const buffer = Buffer.from(data.base64, "base64");
    if (buffer.byteLength > MAX_FILE_BYTES) throw new Error("حجم الملف كبير جدًا (الحد الأقصى 4 ميجابايت)");
    if (!buffer.byteLength) throw new Error("الملف فارغ");

    const safeName = data.fileName.replace(/[^\w.\-\u0600-\u06FF ]/g, "_").slice(0, 120) || "attachment";
    const id = randomUUID();
    const localKey = localFileKey({ labId: lab_id, reportId: data.reportId, attachmentId: id, fileName: safeName });
    let url: string;
    if (useLocal) {
      await files.saveLocalFile(localKey, buffer);
      url = localAttachmentUrl(id);
    } else {
      const { put } = await import("@vercel/blob");
      const blob = await put(`reports/${data.reportId}/${randomUUID()}-${safeName}`, buffer, {
        access: "public",
        contentType: data.contentType || "application/octet-stream",
      });
      url = blob.url;
    }
    try {
      await sql.query(
        `insert into report_attachments (id, report_id, lab_id, file_name, url, content_type, size_bytes, uploaded_by)
         values ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [id, data.reportId, lab_id, safeName, url, data.contentType || null, buffer.byteLength, lab_user_id],
      );
    } catch (err) {
      if (useLocal) await files.deleteLocalFile(localKey).catch(() => undefined); // do not leave a file nobody points to
      throw err;
    }

    await logAudit(sql, { labId: lab_id, actorUserId: lab_user_id, actorAuthUserId: context.userId, action: "attachment.uploaded", entityType: "report", entityId: data.reportId });

    return { id, fileName: safeName, url, contentType: data.contentType || null, sizeBytes: buffer.byteLength, createdAt: new Date().toISOString() };
  });

export const deleteReportAttachment = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context, data }: { context: { userId: string }; data: { reportId: string; attachmentId: string } }) => {
    const { sql, lab_id, lab_user_id } = await getReportForAction(context.userId, data.reportId, "reports.edit");
    const rows = await sql<{ url: string; file_name: string }>`
      select url, file_name from report_attachments where id = ${data.attachmentId} and report_id = ${data.reportId} and lab_id = ${lab_id} limit 1
    `;
    if (!rows.length) throw new Error("الملف غير موجود");

    if (isLocalAttachmentUrl(rows[0].url)) {
      try {
        const files = await import("@/lib/local-files.server");
        await files.deleteLocalFile(localFileKey({ labId: lab_id, reportId: data.reportId, attachmentId: data.attachmentId, fileName: rows[0].file_name }));
      } catch {
        // الملف اتمسح من المجلد قبل كده: نكمل ونمسح السجل عادي.
      }
    } else if (blobConfigured()) {
      try {
        const { del } = await import("@vercel/blob");
        await del(rows[0].url);
      } catch {
        // لو الملف اتمسح من التخزين قبل كده بأي طريقة، نكمل ونمسح السجل عادي.
      }
    }

    await sql.query(`delete from report_attachments where id=$1 and report_id=$2 and lab_id=$3`, [data.attachmentId, data.reportId, lab_id]);
    await logAudit(sql, { labId: lab_id, actorUserId: lab_user_id, actorAuthUserId: context.userId, action: "attachment.deleted", entityType: "report", entityId: data.reportId });
    return { ok: true };
  });
