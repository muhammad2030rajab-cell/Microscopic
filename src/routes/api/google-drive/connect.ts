import { createFileRoute } from "@tanstack/react-router";

const CLIENT_ID = process.env.GOOGLE_DRIVE_CLIENT_ID;

const REDIRECT_URI =
  "https://rajab-diagnostics.vercel.app/api/google-drive/callback";

export const Route = createFileRoute("/api/google-drive/connect")({
  server: {
    handlers: {
      GET: () => {
        if (!CLIENT_ID) {
          return new Response("Google Drive is not configured", {
            status: 500,
          });
        }

        const params = new URLSearchParams({
          client_id: CLIENT_ID,
          redirect_uri: REDIRECT_URI,
          response_type: "code",
          access_type: "offline",
          prompt: "consent",
          scope: "https://www.googleapis.com/auth/drive.file",
        });

        const googleUrl =
          `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;

        return Response.redirect(googleUrl, 302);
      },
    },
  },
});
