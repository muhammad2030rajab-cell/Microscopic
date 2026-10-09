import { createFileRoute } from "@tanstack/react-router";

/** Download/preview of a report attachment stored in the local program. See attachment-local.server.ts. */
export const Route = createFileRoute("/api/attachments/$id")({
  server: {
    handlers: {
      GET: async ({ params }: { params: { id: string } }) => {
        const { handleAttachmentDownload, localAttachmentsEnabled } = await import("@/lib/attachment-local.server");
        if (!localAttachmentsEnabled()) return Response.json({ error: "NOT_FOUND" }, { status: 404 });
        return handleAttachmentDownload(params.id);
      },
    },
  },
});
