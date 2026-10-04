/**
 * Keeps this device's copy in step with the cloud (browser only).
 *
 * Starts once per page load; syncs on start, when the connection returns, when
 * the app comes back to the foreground, and every minute while visible. Being
 * offline is a normal state here, never an error. Two tabs never sync at once
 * (Web Locks), and the engine itself is safe to re-run.
 */
import { getCurrentLab } from "@/lib/lab-access";
import { getCurrentLabPermissions } from "@/lib/lab-users";
import { setKnownLabId, getKnownLabId } from "@/lib/offline/bootstrap-cache";
import { isNetworkError } from "@/lib/offline/network-error";
import { syncOnce } from "./engine";
import { idbLocalStore, requestPersistentStorage } from "./idb-local-store";
import { saveLabPermissions, saveLabProfile } from "./offline-fallback";
import { serverFnTransport } from "./transport";

export type SyncState = {
  phase: "idle" | "syncing" | "offline" | "error";
  lastSyncedAt: string | null;
  error: string | null;
  /** null = not asked yet. false = Chrome may delete this data on a low-storage phone. */
  persistent: boolean | null;
  /** Local changes the server could not take as-is (conflict / rejected) — a person must look. */
  attention: number;
  /** Local changes still waiting to be sent. */
  pending: number;
};

const INTERVAL_MS = 60_000;
let state: SyncState = { phase: "idle", lastSyncedAt: null, error: null, persistent: null, attention: 0, pending: 0 };
const listeners = new Set<() => void>();
let started = false;
let running = false;

function set(patch: Partial<SyncState>) {
  state = { ...state, ...patch };
  for (const l of listeners) l();
}

export const syncRunner = {
  getState: () => state,
  subscribe(fn: () => void) {
    listeners.add(fn);
    return () => void listeners.delete(fn);
  },

  /** Safe to call from every page: only the first call starts anything. */
  start() {
    if (started || typeof window === "undefined" || typeof indexedDB === "undefined") return;
    started = true;
    void requestPersistentStorage().then((persistent) => set({ persistent }));
    window.addEventListener("online", () => void syncRunner.syncNow());
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") void syncRunner.syncNow();
    });
    window.setInterval(() => {
      if (document.visibilityState === "visible" && navigator.onLine) void syncRunner.syncNow();
    }, INTERVAL_MS);
    void syncRunner.syncNow();
  },

  async syncNow(): Promise<void> {
    if (typeof navigator === "undefined" || running) return;
    if (navigator.onLine === false) return set({ phase: "offline" });
    const locks = (navigator as Navigator & { locks?: LockManager }).locks;
    const run = async () => {
      running = true;
      set({ phase: "syncing", error: null });
      try {
        let labId: string;
        try {
          const lab = await getCurrentLab();
          labId = lab.lab_id;
          setKnownLabId(labId);
          saveLabProfile(lab);
          // Best effort: only used to decide which buttons offline screens show.
          void getCurrentLabPermissions().then((a) => saveLabPermissions(a.permissions)).catch(() => undefined);
        } catch (err) {
          // Offline: normal. Anything else (signed out): nothing to sync, stay quiet.
          return set({ phase: isNetworkError(err, navigator.onLine) ? "offline" : "idle" });
        }
        const store = idbLocalStore();
        const result = await syncOnce(store, serverFnTransport, labId);
        if (!result.ok) return set({ phase: "offline" });
        const outbox = await store.listOutbox(labId);
        set({
          phase: "idle",
          lastSyncedAt: new Date().toISOString(),
          pending: outbox.filter((i) => i.status === "pending").length,
          attention: outbox.filter((i) => i.status !== "pending").length,
        });
      } catch (err) {
        set({ phase: "error", error: err instanceof Error ? err.message : "SYNC_FAILED" });
      } finally {
        running = false;
      }
    };
    if (!locks) return run();
    await locks.request("microscopic-sync", { ifAvailable: true }, (lock) => (lock ? run() : undefined));
  },

  /** The lab this device last synced for, if any. */
  knownLabId: () => getKnownLabId(),
};
