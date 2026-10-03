import { pullSyncChanges, pushSyncChanges } from "@/lib/sync";
import type { OutboxItem, PullPage, PushResult, SyncTransport } from "./engine";

/** Talks to the cloud through the app's own server functions (same session cookie as the website). */
export const serverFnTransport: SyncTransport = {
  pull: (since, limit) => pullSyncChanges({ data: { since, limit } }) as Promise<PullPage>,
  push: (items: OutboxItem[]) =>
    pushSyncChanges({
      data: {
        changes: items.map(({ id, entity, entityId, op, baseVersion, payload }) => ({ id, entity, entityId, op, baseVersion, payload })),
      },
    }) as Promise<PushResult[]>,
};
