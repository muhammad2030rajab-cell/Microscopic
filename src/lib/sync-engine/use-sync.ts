import { useSyncExternalStore } from "react";
import { syncRunner, type SyncState } from "./runner";

const server: SyncState = { phase: "idle", lastSyncedAt: null, error: null, persistent: null, attention: 0, pending: 0 };

export function useSyncState(): SyncState {
  return useSyncExternalStore(syncRunner.subscribe, syncRunner.getState, () => server);
}
