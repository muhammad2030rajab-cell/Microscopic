import { createFileRoute } from "@tanstack/react-router";
import { auth } from "@/lib/auth/server";
import { licenseErrorMessage } from "@/lib/license";

// Sign-in / sign-up are refused on a computer the activation code was not issued for.
async function guardedPost(request: Request): Promise<Response> {
  try {
    const { assertLicensedHere } = await import("@/lib/license-guard.server");
    await assertLicensedHere();
  } catch (error) {
    return new Response(JSON.stringify({ message: licenseErrorMessage(error), code: "LICENSE" }), {
      status: 403,
      headers: { "content-type": "application/json" },
    });
  }
  return auth.handler(request);
}

export const Route = createFileRoute("/api/auth/$")({
  server: {
    handlers: {
      GET: ({ request }) => auth.handler(request),
      POST: ({ request }) => guardedPost(request),
    },
  },
});
