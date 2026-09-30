import { useCallback, useEffect, useState } from "react";
import { CHANGED_EVENT, listPending, syncPending, type PendingReport } from "./sync";

export function useOnline(): boolean {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  return online;
}

export function usePendingReports(): { items: PendingReport[]; refresh: () => void } {
  const [items, setItems] = useState<PendingReport[]>([]);
  const refresh = useCallback(() => {
    void listPending().then(setItems);
  }, []);
  useEffect(() => {
    refresh();
    window.addEventListener(CHANGED_EVENT, refresh);
    window.addEventListener("focus", refresh);
    return () => {
      window.removeEventListener(CHANGED_EVENT, refresh);
      window.removeEventListener("focus", refresh);
    };
  }, [refresh]);
  return { items, refresh };
}

export { syncPending };
