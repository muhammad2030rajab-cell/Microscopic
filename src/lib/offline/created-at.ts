/**
 * The time a report was entered on the device, if plausible.
 * A report typed offline at 9:00 and synced at 15:00 should say 9:00 — but a
 * wrong phone clock must not be able to backdate or future-date records.
 */
export function effectiveCreatedAt(clientCreatedAt: string | undefined, now = new Date()): Date {
  if (!clientCreatedAt) return now;
  const t = new Date(clientCreatedAt);
  const ms = t.getTime();
  if (Number.isNaN(ms)) return now;
  if (ms > now.getTime() + 5 * 60_000) return now; // in the future
  if (ms < now.getTime() - 30 * 24 * 3_600_000) return now; // older than 30 days
  return t;
}
