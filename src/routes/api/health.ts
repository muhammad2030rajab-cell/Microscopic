import { createFileRoute } from "@tanstack/react-router";
import { getSql, dbSource } from "@/lib/db";
import { logEvent } from "@/lib/logger.server";

/**
 * Health check for uptime monitoring (UptimeRobot, Better Uptime, a Vercel
 * cron ping, a load balancer check, etc.). There was no such endpoint before
 * this, so nothing could verify the app *and its database* were actually up
 * without exercising a real authenticated feature.
 *
 * Deliberately unauthenticated (it must be reachable by external monitors)
 * and deliberately minimal — no schema/version/row-count details that could
 * help an attacker fingerprint the deployment.
 */
export const Route = createFileRoute("/api/health")({
  server: {
    handlers: {
      GET: async () => {
        const startedAt = Date.now();
        try {
          const sql = await getSql();
          await sql`select 1`;
          return Response.json({
            status: "ok",
            db: dbSource,
            latencyMs: Date.now() - startedAt,
            timestamp: new Date().toISOString(),
          });
        } catch (err) {
          logEvent("error", "health_check.failed", { error: String(err) });
          return Response.json(
            { status: "error", timestamp: new Date().toISOString() },
            { status: 503 },
          );
        }
      },
    },
  },
});
