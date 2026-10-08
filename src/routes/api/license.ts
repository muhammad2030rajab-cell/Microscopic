import { createFileRoute } from "@tanstack/react-router";

/** License server endpoint for customers' programs (activation + revocation check). See license-server.server.ts. */
export const Route = createFileRoute("/api/license")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { handleLicenseRequest } = await import("@/lib/license-server.server");
        return handleLicenseRequest(request);
      },
    },
  },
});
