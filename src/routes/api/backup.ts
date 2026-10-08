import { createFileRoute } from "@tanstack/react-router";

/** Backup download (GET) and restore upload (POST) for the local program. See backup.server.ts. */
export const Route = createFileRoute("/api/backup")({
  server: {
    handlers: {
      GET: async () => {
        const { handleBackupDownload } = await import("@/lib/backup.server");
        return handleBackupDownload();
      },
      POST: async ({ request }) => {
        const { handleRestoreUpload } = await import("@/lib/backup.server");
        return handleRestoreUpload(request);
      },
    },
  },
});
