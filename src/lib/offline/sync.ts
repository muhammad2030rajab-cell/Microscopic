import { getCurrentLab } from "@/lib/lab-access";
import { createLabReport, type CreateLabReportInput } from "@/lib/lab-reports";
import { clearBootstrap, getKnownLabId, setKnownLabId } from "./bootstrap-cache";
import { idbStore } from "./idb-store";
import { isNetworkError } from "./network-error";
import { enqueue, flush, listForLab, retry, type FlushResult, type QueuedReport, type QueueStore } from "./queue";

export type PendingPayload = Omit<CreateLabReportInput, "clientRequestId" | "clientCreatedAt" | "expectedLabId">;
export type PendingReport = QueuedReport<PendingPayload>;

export const CHANGED_EVENT = "rajab:offline-changed";
const READY_KEY = "rajab:offline:ready";

let store: QueueStore<PendingPayload> | null = null;
function getStore(): QueueStore<PendingPayload> {
  return (store ??= idbStore<PendingPayload>());
}

function changed() {
  window.dispatchEvent(new Event(CHANGED_EVENT));
}

export function newRequestId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function isOffline(err?: unknown): boolean {
  return isNetworkError(err, typeof navigator !== "undefined" ? navigator.onLine : undefined);
}

/** Save a report on this device to be sent when the connection is back. */
export async function queueReport(input: {
  requestId: string;
  labId: string;
  payload: PendingPayload;
  createdAt?: string;
}): Promise<void> {
  await enqueue(getStore(), {
    id: input.requestId,
    labId: input.labId,
    label: input.payload.patientName.trim(),
    payload: input.payload,
    createdAt: input.createdAt,
  });
  changed();
}

export async function listPending(): Promise<PendingReport[]> {
  try {
    return await listForLab(getStore(), getKnownLabId());
  } catch {
    return [];
  }
}

export async function retryPending(id: string): Promise<void> {
  await retry(getStore(), id);
  changed();
}

export async function deletePending(id: string): Promise<void> {
  await getStore().remove(id);
  changed();
}

let running = false;

/**
 * Send everything queued for the signed-in lab. Safe to call any time: it does
 * nothing when offline, when already running, or when another tab is syncing
 * (Web Locks), and the server ignores duplicates by request id.
 */
export async function syncPending(): Promise<FlushResult | null> {
  if (typeof navigator === "undefined" || navigator.onLine === false || running) return null;
  running = true;
  try {
    const run = async (): Promise<FlushResult | null> => {
      try {
        const all = await getStore().list();
        if (!all.some((i) => i.status === "pending")) return null; // nothing to send: no network call
      } catch {
        return null; // storage unavailable
      }
      let labId: string;
      try {
        labId = (await getCurrentLab()).lab_id;
      } catch {
        return null; // offline, or not signed in: try again later
      }
      setKnownLabId(labId);
      const result = await flush(
        getStore(),
        labId,
        (item) =>
          createLabReport({
            data: {
              ...item.payload,
              clientRequestId: item.id,
              clientCreatedAt: item.createdAt,
              expectedLabId: item.labId,
            },
          }),
        (err) => isOffline(err),
      );
      changed();
      return result;
    };
    const locks = (navigator as Navigator & { locks?: LockManager }).locks;
    if (!locks) return await run();
    return await locks.request("rajab-offline-sync", { ifAvailable: true }, (lock) => (lock ? run() : null));
  } finally {
    running = false;
  }
}

/* ---------------- service worker ---------------- */

export function registerServiceWorker(onReady: () => void): void {
  if (!import.meta.env.PROD || typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  navigator.serviceWorker.addEventListener("message", (event) => {
    if (event.data?.type === "cached") {
      try {
        if (localStorage.getItem(READY_KEY) !== "1") {
          localStorage.setItem(READY_KEY, "1");
          onReady();
        }
      } catch {
        /* ignore */
      }
    }
  });
  void navigator.serviceWorker.register("/sw.js").catch(() => undefined);
}

/** Pages the worker keeps for offline use. Must match OFFLINE_PAGES in public/sw-rules.js. */
export const OFFLINE_PAGE_URLS = ["/new", "/lab", "/patients", "/catalog", "/analytics"] as const;

/**
 * Once per browser session, signed in: ask the worker to keep every offline-capable screen (and the build
 * files they need), so they all open with no connection even if this device never visited them.
 */
const PAGES_KEPT_KEY = "microscopic:pages-kept:v1";

export function requestAllOfflinePages(): void {
  try {
    if (sessionStorage.getItem(PAGES_KEPT_KEY)) return;
    sessionStorage.setItem(PAGES_KEPT_KEY, "1");
  } catch {
    /* storage blocked: just ask again next time */
  }
  for (const url of OFFLINE_PAGE_URLS) requestPageCache(url);
}

/** Ask the worker to keep a copy of an offline-capable page (signed-in only). */
export function requestPageCache(url: string): void {
  if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return;
  void navigator.serviceWorker.ready.then((reg) => reg.active?.postMessage({ type: "cache-page", url }));
}

/** Sign-out: drop saved pages and the offline profile. Queued reports are kept. */
export async function clearOfflineCaches(): Promise<void> {
  clearBootstrap();
  try {
    sessionStorage.removeItem(PAGES_KEPT_KEY); // the next sign-in must save the screens again
  } catch {
    /* ignore */
  }
  // The device copy of the lab's patients and reports must not outlive the session.
  const { clearLocalData } = await import("../sync-engine/offline-fallback");
  await clearLocalData();
  try {
    if ("serviceWorker" in navigator) {
      const reg = await navigator.serviceWorker.getRegistration();
      reg?.active?.postMessage({ type: "clear" });
    }
  } catch {
    /* ignore */
  }
}
