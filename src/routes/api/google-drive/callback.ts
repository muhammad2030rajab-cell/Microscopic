import { createFileRoute } from "@tanstack/react-router";

const CLIENT_ID = process.env.GOOGLE_DRIVE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_DRIVE_CLIENT_SECRET;

export const Route = createFileRoute("/api/google-drive/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { isPlatformAdminRequest, driveRedirectUri, readCookie, STATE_COOKIE } = await import(
          "@/lib/storage/google-drive-oauth.server"
        );

        // Only the platform admin who started the flow may finish it, and the
        // `state` must match the cookie set by /connect (CSRF protection).
        if (!(await isPlatformAdminRequest(request))) {
          return new Response("Forbidden", { status: 403 });
        }

        const url = new URL(request.url);
        const expectedState = readCookie(request, STATE_COOKIE);
        if (!expectedState || url.searchParams.get("state") !== expectedState) {
          return new Response("Invalid or expired state. Start again from /api/google-drive/connect.", {
            status: 400,
          });
        }

        const code = url.searchParams.get("code");
        const error = url.searchParams.get("error");

        if (error) {
          return new Response(
            `Google authorization failed: ${error}`,
            { status: 400 },
          );
        }

        if (!code) {
          return new Response("Authorization code is missing", {
            status: 400,
          });
        }

        if (!CLIENT_ID || !CLIENT_SECRET) {
          return new Response("Google Drive credentials are not configured", {
            status: 500,
          });
        }

        const body = new URLSearchParams({
          code,
          client_id: CLIENT_ID,
          client_secret: CLIENT_SECRET,
          redirect_uri: driveRedirectUri(request),
          grant_type: "authorization_code",
        });

        const response = await fetch(
          "https://oauth2.googleapis.com/token",
          {
            method: "POST",
            headers: {
              "content-type":
                "application/x-www-form-urlencoded",
            },
            body,
          },
        );

        if (!response.ok) {
          const text = await response.text();

          return new Response(
            `Google token exchange failed: ${text.slice(0, 500)}`,
            { status: 500 },
          );
        }

        const data = (await response.json()) as {
          access_token?: string;
          refresh_token?: string;
        };

        if (!data.refresh_token) {
          return new Response(
            "No refresh token received. Please revoke the previous authorization and try again.",
            { status: 500 },
          );
        }

        return new Response(
          `Google Drive connected successfully.

Refresh Token:
${data.refresh_token}

Copy this value to Vercel as:
GOOGLE_DRIVE_REFRESH_TOKEN`,
          {
            status: 200,
            headers: {
              "content-type": "text/plain; charset=utf-8",
              "cache-control": "no-store",
              "set-cookie": `${STATE_COOKIE}=; Path=/api/google-drive; HttpOnly; Secure; SameSite=Lax; Max-Age=0`,
            },
          },
        );
      },
    },
  },
});
