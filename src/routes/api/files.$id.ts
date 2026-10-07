import { createFileRoute } from "@tanstack/react-router";

/**
 * Serves an attachment kept on the lab PC (local program only). The browser asks for /api/files/<attachment id>;
 * the person must be signed in, allowed to view that report (same lab, same branch rules as the report page),
 * and the file's place on disk is rebuilt from database ids, never from the request.
 */
export const Route = createFileRoute("/api/files/$id")({
  server: {
    handlers: {
      GET: async ({ request, params }: { request: Request; params: { id: string } }) => {
        const notFound = () => new Response("Not found", { status: 404 });
        const { auth } = await import("@/lib/auth/server");
        const session = await auth.api.getSession({ headers: request.headers });
        if (!session?.user) return new Response("Unauthorized", { status: 401 });

        const { getSql } = await import("@/lib/db");
        const sql = await getSql();
        const rows = await sql<{ report_id: string; lab_id: string; file_name: string; content_type: string | null; url: string }>`
          select report_id, lab_id, file_name, content_type, url from report_attachments where id = ${params.id} limit 1
        `;
        const row = rows[0];
        const { isLocalAttachmentUrl, localFileKey, fileResponseType } = await import("@/lib/local-files");
        if (!row || !isLocalAttachmentUrl(row.url)) return notFound();

        try {
          const { getReportForAction } = await import("@/lib/lab-reports");
          const ctx = await getReportForAction(session.user.id, row.report_id, "reports.view");
          if (ctx.lab_id !== row.lab_id) return notFound();
        } catch {
          return notFound(); // no access looks the same as no file
        }

        const { readLocalFile } = await import("@/lib/local-files.server");
        const data = await readLocalFile(localFileKey({ labId: row.lab_id, reportId: row.report_id, attachmentId: params.id, fileName: row.file_name }));
        if (!data) return notFound();

        const { type, inline } = fileResponseType(row.content_type);
        return new Response(new Uint8Array(data), {
          headers: {
            "content-type": type,
            "content-length": String(data.byteLength),
            "content-disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(row.file_name)}`,
            "x-content-type-options": "nosniff",
            "cache-control": "private, max-age=300",
          },
        });
      },
    },
  },
});
