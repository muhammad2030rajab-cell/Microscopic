/**
 * The backup file: a plain JSON copy of everything this device holds (patients, reports, results, catalog,
 * attachment records and work not yet sent). Pure, no imports, so it is tested without a phone.
 *
 * The cloud is the main backup: signing in on a new phone brings everything back by itself. This file is an
 * extra copy you keep yourself, and it contains patient names and results, so it must be kept private.
 */
export const BACKUP_FORMAT = "microscopic-backup";
export const BACKUP_VERSION = 1;

export type BackupTables = Record<string, Record<string, unknown>[]>;

export type BackupFile = {
  json: string;
  filename: string;
  counts: { patients: number; reports: number; results: number; catalog: number; unsent: number };
};

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

export function buildBackup(tables: BackupTables, now: Date = new Date()): BackupFile {
  const count = (name: string) => (Array.isArray(tables[name]) ? tables[name].length : 0);
  const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}`;
  return {
    json: JSON.stringify({ format: BACKUP_FORMAT, version: BACKUP_VERSION, exportedAt: now.toISOString(), tables }, null, 1),
    filename: `microscopic-backup-${stamp}.json`,
    counts: {
      patients: count("patients"),
      reports: count("reports"),
      results: count("report_results"),
      catalog: count("lab_test_catalog"),
      unsent: count("outbox"),
    },
  };
}
