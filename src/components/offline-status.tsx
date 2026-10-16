import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { CloudUpload, Loader2, RefreshCw, Trash2, WifiOff } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { deletePending, retryPending, syncPending } from "@/lib/offline/sync";
import { useOnline, usePendingReports } from "@/lib/offline/use-offline";
import { syncRunner } from "@/lib/sync-engine/runner";
import { isInstalledApp } from "@/lib/native-back";
import { useSyncState } from "@/lib/sync-engine/use-sync";

/**
 * Connection banner + outbox for reports saved on this device.
 * Renders nothing when online with an empty outbox.
 */
export function OfflineStatus() {
  const online = useOnline();
  const { items, refresh } = usePendingReports();
  const [syncing, setSyncing] = useState(false);
  const [open, setOpen] = useState(false);

  async function sync(silent = false) {
    setSyncing(true);
    try {
      const r = await syncPending();
      if (r && r.sent > 0) toast.success(`تم إرسال ${r.sent} تقرير محفوظ على الجهاز`);
      if (r && r.failed > 0) toast.error(`${r.failed} تقرير رفضه الخادم — راجعها في القائمة`);
      if (!r && !silent) toast.error("تعذر الاتصال بالخادم");
    } finally {
      setSyncing(false);
      refresh();
    }
  }

  // Send automatically when the connection returns and on first load.
  useEffect(() => {
    if (online) void sync(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online]);

  // Keep this device's copy of the lab's data in step with the cloud (starts once per page load).
  const syncState = useSyncState();
  useEffect(() => {
    syncRunner.start();
  }, []);
  // Data is on the device but Chrome may delete it when storage runs low: tell the person, once it matters.
  // Not inside the installed app (Android app / home-screen PWA): the advice is "install it", and it already is.
  const [installed, setInstalled] = useState(false);
  useEffect(() => setInstalled(isInstalledApp()), []);
  const storageAtRisk = !installed && syncState.persistent === false && syncState.lastSyncedAt !== null;

  const pending = items.filter((i) => i.status === "pending");
  const failed = items.filter((i) => i.status === "failed");
  if (online && items.length === 0 && !storageAtRisk && syncState.attention === 0) return null;

  return (
    <div className="no-print space-y-2 px-4 pt-3 sm:px-6 lg:px-8" role="status">
      {!online ? (
        <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <WifiOff className="mt-0.5 size-4 shrink-0" />
          <p>
            أنت غير متصل بالإنترنت. تقدر تكمل إنشاء التقارير، وهتتحفظ على جهازك وتتبعت تلقائيًا لما الاتصال يرجع.
          </p>
        </div>
      ) : null}

      {storageAtRisk ? (
        <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          المتصفح ممكن يمسح البيانات المحفوظة على الجهاز لو المساحة قلّت. ثبّت التطبيق على الشاشة الرئيسية، وسيب مساحة فاضية.
        </p>
      ) : null}
      {syncState.attention > 0 ? (
        <p className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900">
          {syncState.attention} تغيير على الجهاز مارضيش الخادم يقبله أو فيه تعارض.{" "}
          <Link to="/sync" className="font-semibold underline">راجعه دلوقتي</Link>
        </p>
      ) : null}

      {items.length > 0 ? (
        <div className="app-card">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="flex min-h-11 w-full items-center justify-between gap-2 px-4 py-2 text-sm"
          >
            <span className="inline-flex items-center gap-2 font-medium">
              <CloudUpload className="size-4 text-teal" />
              {pending.length > 0 ? `${pending.length} تقرير بانتظار الإرسال` : null}
              {pending.length > 0 && failed.length > 0 ? " · " : null}
              {failed.length > 0 ? <span className="text-high">{failed.length} مرفوض</span> : null}
            </span>
            <span className="text-xs text-muted">{open ? "إخفاء" : "عرض"}</span>
          </button>

          {open ? (
            <ul className="divide-y divide-line border-t border-line">
              {items.map((item) => (
                <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{item.label}</p>
                    <p className="text-xs text-muted" dir="ltr">
                      {new Date(item.createdAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}
                    </p>
                    {item.status === "failed" ? (
                      <p className="mt-1 text-xs text-high">{item.lastError || "رفضه الخادم"}</p>
                    ) : null}
                  </div>
                  <div className="flex gap-2">
                    {item.status === "failed" ? (
                      <Button size="sm" variant="secondary" onClick={() => void retryPending(item.id).then(() => sync())}>
                        <RefreshCw className="size-3.5" />
                        إعادة
                      </Button>
                    ) : null}
                    <Button
                      size="sm"
                      variant="secondary"
                      aria-label={`حذف تقرير ${item.label}`}
                      onClick={() => {
                        if (window.confirm(`حذف تقرير ${item.label} من الجهاز؟ لن يتم إرساله.`)) void deletePending(item.id);
                      }}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          ) : null}

          {online && pending.length > 0 ? (
            <div className="border-t border-line p-3">
              <Button size="sm" onClick={() => void sync()} disabled={syncing}>
                {syncing ? <Loader2 className="size-4 animate-spin" /> : <CloudUpload className="size-4" />}
                إرسال الآن
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
