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
import { isMirrorFresh } from "../sync-shared";
import { outboxStateFor } from "./edit-item";
import { applyPendingEdit, toReportDetail, toReportSummaries, type LocalReportDetail, type LocalReportSummary } from "./local-reads";

const PROFILE_KEY = "microscopic:lab-profile:v1";
const PERMS_KEY = "microscopic:lab-perms:v1";

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

/** What this user may do, remembered so offline screens can hide buttons. Advisory only: the server re-checks every pushed change. */
export function saveLabPermissions(perms: Record<string, boolean | undefined>): void {
  try {
    localStorage.setItem(PERMS_KEY, JSON.stringify(perms));
  } catch {
    /* ignore */
  }
}
export function loadLabPermissions(): Record<string, boolean | undefined> {
  try {
    const raw = localStorage.getItem(PERMS_KEY);
    return raw ? (JSON.parse(raw) as Record<string, boolean | undefined>) : {};
  } catch {
    return {};
  }
}

/** Sign-out: wipe the lab profile and the device copy of patient data. Unsent changes (the outbox) are kept, like the old offline queue. */
export async function clearLocalData(): Promise<void> {
  try {
    localStorage.removeItem(PROFILE_KEY);
    localStorage.removeItem(PERMS_KEY);
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
    if (!isMirrorFresh(await store.getLastSync(labId), Date.now())) return null;
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
export async function loadLocalReport<L>(
  err: unknown,
  reportId: string,
): Promise<{ report: LocalReportDetail; lab: L; pendingEdit: boolean } | null> {
  if (!canUseLocal(err)) return null;
  const labId = getKnownLabId();
  const lab = loadLabProfile<L>();
  if (!labId || !lab) return null;
  try {
    const store = idbLocalStore();
    if (!isMirrorFresh(await store.getLastSync(labId), Date.now())) return null;
    const report = await store.getRow("reports", reportId);
    if (!report || !ofLab(labId)(report)) return null;
    const patient = await store.getRow("patients", String(report.patient_id));
    const detail = toReportDetail(report, patient, await store.getResults(reportId));
    if (!detail) return null;
    // An edit made on this device and not yet sent is shown on top of the pulled copy.
    const { pending } = outboxStateFor(await store.listOutbox(labId), reportId);
    return { report: pending ? applyPendingEdit(detail, pending.payload) : detail, lab, pendingEdit: Boolean(pending) };
  } catch {
    return null;
  }
}

type CatalogLike = { lab_id: string; category_id: string; test_name: string; is_active?: boolean; [k: string]: unknown };

/**
 * Everything the edit screen needs with no connection: the report (with any
 * unsent edit on top), the lab's catalog from the device copy, and whether this
 * user may edit. `blocked` = an earlier edit of this report was refused by the
 * server and nobody resolved it, so a new offline edit must wait.
 */
export async function loadLocalEdit<L, C extends CatalogLike>(
  err: unknown,
  reportId: string,
): Promise<{ report: LocalReportDetail; lab: L; catalog: C[]; canEdit: boolean; blocked: boolean } | null> {
  const found = await loadLocalReport<L>(err, reportId);
  const labId = getKnownLabId();
  if (!found || !labId) return null;
  try {
    const store = idbLocalStore();
    const catalog = (await store.listRows("lab_test_catalog"))
      .filter((r) => ofLab(labId)(r) && r.is_active !== false) as unknown as C[];
    if (!catalog.length) return null;
    const { blocked } = outboxStateFor(await store.listOutbox(labId), reportId);
    return {
      report: found.report,
      lab: found.lab,
      catalog,
      canEdit: loadLabPermissions()["reports.edit"] === true,
      blocked: Boolean(blocked),
    };
  } catch {
    return null;
  }
}
