/**
 * Minimal structured logger (server-only).
 *
 * The app had no consistent shape for server logs, which makes it hard to
 * wire into any real monitoring stack (Vercel log drains, Datadog, Axiom,
 * Sentry log ingestion, etc. all work far better with one-line JSON records
 * than free-text `console.log`). This does not replace a real error-tracking
 * SDK (e.g. Sentry) — add one for exception capture + alerting. This just
 * gives every log line a consistent, greppable/parseable shape in the
 * meantime.
 *
 * Usage:
 *   import { logEvent } from "@/lib/logger.server";
 *   logEvent("info", "lab.create", { labId, actorAuthUserId });
 *   logEvent("error", "lab.create.failed", { error: String(err) });
 */
export type LogLevel = "info" | "warn" | "error";

export function logEvent(
  level: LogLevel,
  event: string,
  meta: Record<string, unknown> = {},
): void {
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    event,
    ...meta,
  });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}
