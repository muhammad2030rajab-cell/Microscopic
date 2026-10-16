/**
 * Dashboard alert texts: unpaid invoices and the backup reminder. Pure (only imports other pure modules),
 * unit-tested with plain node (see lab-alerts.test.ts). Returns null when there is nothing to say.
 */
import { formatMoney } from "./billing-math.ts";
import { backupAge } from "./backup-age.ts";

/** "3 فاتورة عليها متبقي · 1,250 ج.م" — null when nothing is owed. */
export function unpaidAlertText(count: number, outstandingPiastres: number): string | null {
  if (!Number.isFinite(count) || count <= 0 || !Number.isFinite(outstandingPiastres) || outstandingPiastres <= 0) return null;
  return `${count} فاتورة عليها متبقي · ${formatMoney(outstandingPiastres)}`;
}

/**
 * Backup reminder for the local program. `available` comes from getBackupInfo (false on the cloud deployment
 * and for people who may not back up) — then there is never a reminder.
 */
export function backupAlertText(available: boolean, lastBackupAt: string | null, now: number = Date.now()): string | null {
  if (!available) return null;
  const age = backupAge(lastBackupAt, now);
  if (age.state === "never") return "لسه ماعملتش أي نسخة احتياطية";
  if (age.state === "stale") return `آخر نسخة احتياطية من ${age.days} يوم`;
  return null;
}
