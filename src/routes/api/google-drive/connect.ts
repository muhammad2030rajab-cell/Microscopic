import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/google-drive/connect")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const clientId = process.env.GOOGLE_DRIVE_CLIENT_ID?.trim();
        if (!clientId) {
          return new Response("Google Drive is not configured", { status: 500 });
        }

        const { isPlatformAdminRequest, driveRedirectUri, newState, STATE_COOKIE } = await import(
          "@/lib/storage/google-drive-oauth.server"
        );

        // Only a signed-in platform admin may start the connection.
        if (!(await isPlatformAdminRequest(request))) {
          return new Response("Forbidden", { status: 403 });
        }

        const state = newState();
        const params = new URLSearchParams({
          client_id: clientId,
          redirect_uri: driveRedirectUri(request),
          response_type: "code",
          access_type: "offline",
          prompt: "consent",
          scope: "https://www.googleapis.com/auth/drive.file",
          state,
        });

        return new Response(null, {
          status: 302,
          headers: {
            location: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`,
            "set-cookie": `${STATE_COOKIE}=${state}; Path=/api/google-drive; HttpOnly; Secure; SameSite=Lax; Max-Age=600`,
            "cache-control": "no-store",
          },
        });
      },
    },
  },
});
