/** How old the last backup is, for the reminder in Settings > Backup. Pure, unit-tested. */

export const BACKUP_STALE_DAYS = 7;

export type BackupAge =
  | { state: "never" }
  | { state: "fresh"; days: number }
  | { state: "stale"; days: number };

/** lastBackupAt is an ISO timestamp (or null / unreadable = never). Whole days, never negative. */
export function backupAge(lastBackupAt: string | null, now: number = Date.now()): BackupAge {
  if (!lastBackupAt) return { state: "never" };
  const t = Date.parse(lastBackupAt);
  if (!Number.isFinite(t)) return { state: "never" };
  const days = Math.max(0, Math.floor((now - t) / 86_400_000));
  return days >= BACKUP_STALE_DAYS ? { state: "stale", days } : { state: "fresh", days };
}
