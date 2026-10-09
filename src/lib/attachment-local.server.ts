import { getSql } from "@/lib/db";
import { CrossSiteRequestError, assertSameSiteRequest } from "@/lib/auth/isolation.server";
import { UnauthorizedError, requireUserId } from "@/lib/auth/verify.server";
import { assertLicensedRuntime } from "@/lib/license-runtime.server";
import { getReportForAction } from "@/lib/lab-reports";
import { logEvent } from "@/lib/logger.server";
import { contentDisposition, servedContentType } from "@/lib/attachment-rules";

/**
 * Report attachments inside the lab's own program (hub mode, no internet).
 * The file is stored in the program's database (so the .rjbak backup carries it) and served from
 * /api/attachments/<id> only to a signed-in user who may view that report. Never used on the cloud deployment.
 */
export const localAttachmentsEnabled = (): boolean => process.env.HUB_MODE === "1" && !process.env.VERCEL;

export async function handleAttachmentDownload(id: string): Promise<Response> {
  try {
    assertSameSiteRequest();
    const userId = await requireUserId();
    await assertLicensedRuntime();
    if (!/^[\w-]{1,80}$/.test(id)) return Response.json({ error: "NOT_FOUND" }, { status: 404 });

    const sql = await getSql();
    const meta = await sql<{ report_id: string }>`select report_id from report_attachments where id = ${id} limit 1`;
    if (!meta.length) return Response.json({ error: "NOT_FOUND" }, { status: 404 });

    // Same lab, branch and "view reports" permission checks as every other report screen.
    const { lab_id } = await getReportForAction(userId, meta[0].report_id, "reports.view");
    const rows = await sql<{ file_name: string; content_type: string | null; data_base64: string }>`
      select a.file_name, a.content_type, f.data_base64
      from report_attachments a
      join report_attachment_files f on f.attachment_id = a.id
      where a.id = ${id} and a.lab_id = ${lab_id}
      limit 1
    `;
    if (!rows.length) return Response.json({ error: "NOT_FOUND" }, { status: 404 });

    const row = rows[0];
    return new Response(Buffer.from(row.data_base64, "base64") as unknown as BodyInit, {
      headers: {
        "content-type": servedContentType(row.content_type),
        "content-disposition": contentDisposition(row.file_name, row.content_type),
        "cache-control": "private, no-store",
        "x-content-type-options": "nosniff",
        "content-security-policy": "sandbox; default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'",
      },
    });
  } catch (error) {
    if (error instanceof UnauthorizedError) return Response.json({ error: "UNAUTHORIZED" }, { status: 401 });
    if (error instanceof CrossSiteRequestError) return Response.json({ error: "FORBIDDEN" }, { status: 403 });
    const text = error instanceof Error ? error.message : "";
    if (/REPORT_NOT_FOUND/.test(text)) return Response.json({ error: "NOT_FOUND" }, { status: 404 });
    if (/PERMISSION|FORBIDDEN|LICENSE/i.test(text)) return Response.json({ error: "FORBIDDEN" }, { status: 403 });
    logEvent("error", "attachment.download_failed", { error: text });
    return Response.json({ error: "FAILED" }, { status: 500 });
  }
}
