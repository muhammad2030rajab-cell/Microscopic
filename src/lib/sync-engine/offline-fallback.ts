/**
 * "No connection" fallbacks for the screens' loaders (browser only).
 *
 * A loader calls these ONLY from its catch block, and they answer ONLY when the
 * failure was a network failure. A server answer such as "not signed in" is not
 * a network failure, so it still sends the person to the login page — the local
 * copy is never a way around a rejected session.
 */
import { isNetworkError } from "../offline/network-error";
import { getKnownLabId } from "../offline/bootstrap-cache";
import { idbLocalStore } from "./idb-local-store";
import { toReportDetail, toReportSummaries, type LocalReportDetail, type LocalReportSummary } from "./local-reads";

const PROFILE_KEY = "microscopic:lab-profile:v1";

function canUseLocal(err: unknown): boolean {
  return typeof indexedDB !== "undefined" && isNetworkError(err, typeof navigator !== "undefined" ? navigator.onLine : undefined);
}

/** The lab's own profile (name, address, doctor…) so a report can be shown/printed offline. Not patient data. */
export function saveLabProfile(lab: unknown): void {
  try {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(lab));
  } catch {
    /* storage blocked: offline printing just won't have the header */
  }
}
export function loadLabProfile<T>(): T | null {
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

/** Sign-out: wipe the lab profile and the device copy of patient data. Unsent changes (the outbox) are kept, like the old offline queue. */
export async function clearLocalData(): Promise<void> {
  try {
    localStorage.removeItem(PROFILE_KEY);
  } catch {
    /* ignore */
  }
  try {
    if (typeof indexedDB !== "undefined") await idbLocalStore().clearMirror();
  } catch {
    /* ignore */
  }
}

type Row = Record<string, unknown>;
const ofLab = (labId: string) => (r: Row) => String(r.lab_id) === labId;

/** Archive list from the device copy; null = no usable copy (never synced here, or the failure was not the network). */
export async function loadLocalReportList(err: unknown): Promise<LocalReportSummary[] | null> {
  if (!canUseLocal(err)) return null;
  const labId = getKnownLabId();
  if (!labId) return null;
  try {
    const store = idbLocalStore();
    if ((await store.getCursor(labId)) === 0) return null;
    const [reports, patients, results] = await Promise.all([store.listRows("reports"), store.listRows("patients"), store.listAllResults()]);
    const grouped = new Map<string, Row[]>();
    for (const r of results) {
      const key = String(r.report_id);
      grouped.set(key, [...(grouped.get(key) ?? []), r]);
    }
    return toReportSummaries(reports.filter(ofLab(labId)), patients.filter(ofLab(labId)), grouped);
  } catch {
    return null;
  }
}

/** One report from the device copy, plus the cached lab profile it needs for the header. */
export async function loadLocalReport<L>(err: unknown, reportId: string): Promise<{ report: LocalReportDetail; lab: L } | null> {
  if (!canUseLocal(err)) return null;
  const labId = getKnownLabId();
  const lab = loadLabProfile<L>();
  if (!labId || !lab) return null;
  try {
    const store = idbLocalStore();
    const report = await store.getRow("reports", reportId);
    if (!report || !ofLab(labId)(report)) return null;
    const patient = await store.getRow("patients", String(report.patient_id));
    const detail = toReportDetail(report, patient, await store.getResults(reportId));
    return detail ? { report: detail, lab } : null;
  } catch {
    return null;
  }
}
