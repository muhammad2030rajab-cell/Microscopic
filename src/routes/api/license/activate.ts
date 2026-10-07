import { createFileRoute } from "@tanstack/react-router";
import { getSql } from "@/lib/db";
import { createAttemptLimiter } from "@/lib/join-requests";
import { activateSerial } from "@/lib/license-serials.server";

// Called once by the customer's program (server to server) with a registration number + the computer's id.
// Wrong numbers: 10 per address per 15 minutes.
const failures = createAttemptLimiter({ max: 10, windowMs: 15 * 60_000 });

const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

export const Route = createFileRoute("/api/license/activate")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const ip = (request.headers.get("x-forwarded-for") ?? request.headers.get("x-real-ip") ?? "unknown").split(",")[0].trim();
        if (failures.isBlocked(ip)) return json(429, { error: "TOO_MANY" });
        let body: { serial?: unknown; machine?: unknown };
        try {
          body = (await request.json()) as typeof body;
        } catch {
          return json(400, { error: "BAD_REQUEST" });
        }
        try {
          const result = await activateSerial(await getSql(), body.serial, body.machine);
          if (result.ok) return json(200, { code: result.code });
          if (result.error === "SERIAL_INVALID" || result.error === "SERIAL_USED") failures.recordFailure(ip);
          const status = result.error === "SERIAL_INVALID" ? 404 : result.error === "SERIAL_USED" ? 409 : result.error === "NOT_CONFIGURED" ? 503 : 400;
          return json(status, { error: result.error });
        } catch {
          return json(500, { error: "SERVER_ERROR" });
        }
      },
    },
  },
});
