import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { getCurrentLab } from "@/lib/lab-access";
import { getKnownLabId } from "@/lib/offline/bootstrap-cache";
import { isNetworkError } from "@/lib/offline/network-error";
import { canReapply, describeReason } from "@/lib/sync-engine/conflict-review";
import type { OutboxItem } from "@/lib/sync-engine/engine";
import { loadSyncIssues, type SyncIssue } from "@/lib/sync-engine/offline-fallback";
import { discardChange, reapplyChange } from "@/lib/sync-engine/outbox-actions";
import { syncRunner } from "@/lib/sync-engine/runner";
import { useSyncState } from "@/lib/sync-engine/use-sync";

export const Route = createFileRoute("/sync")({
  loader: async () => {
    try {
      const lab = await getCurrentLab();
      return { labId: lab.lab_id as string | null };
    } catch (err) {
      // No connection: the device copy can still be reviewed. Any other failure (signed out) goes to login.
      const known = getKnownLabId();
      if (known && isNetworkError(err, typeof navigator !== "undefined" ? navigator.onLine : undefined)) return { labId: known as string | null };
      return { labId: null as string | null };
    }
  },
  component: SyncPage,
});

function SyncPage() {
  const { labId } = Route.useLoaderData();
  const sync = useSyncState();
  const [data, setData] = useState<{ pending: OutboxItem[]; issues: SyncIssue[] } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (labId) setData(await loadSyncIssues(labId));
  }, [labId]);
  // Reload whenever a sync finishes (counts change) as well as on first render.
  useEffect(() => void reload(), [reload, sync.lastSyncedAt, sync.pending, sync.attention]);

  if (!labId) return <Navigate to="/login" replace />;

  async function discard(issue: SyncIssue) {
    if (!window.confirm("هتتجاهل تعديلك نهائيًا وتفضل نسخة الخادم زي ما هي. متأكد؟")) return;
    setBusy(issue.item.id);
    try {
      await discardChange(issue.item.id);
      toast.success("اتجاهل التعديل.");
    } finally {
      setBusy(null);
      void reload();
    }
  }

  async function reapply(issue: SyncIssue) {
    if (!window.confirm("تعديلك هيتطبّق فوق النسخة الحالية على الخادم، واللي اتغيّر هناك في الحقول اللي في الجدول هيتكتب فوقه. متأكد؟")) return;
    setBusy(issue.item.id);
    try {
      const result = await reapplyChange(issue.item);
      if (result === "queued") toast.success("اتعاد تطبيق تعديلك وهيتبعت.");
      else if (result === "not_a_draft") toast.error("التقرير اتلغى، فمينفعش تعدّله. اترك نسخة الخادم.");
      else toast.error("مفيش نسخة محفوظة من التقرير. اتصل بالنت وجرّب تاني.");
    } finally {
      setBusy(null);
      void reload();
    }
  }

  return (
    <AppShell>
      <header className="mb-5">
        <p className="text-xs uppercase tracking-[0.18em] text-muted">Sync</p>
        <h1 className="mt-1 font-display text-2xl font-semibold sm:text-3xl">المزامنة والتغييرات المحتاجة مراجعة</h1>
      </header>

      <section className="mb-6 app-card p-4">
        <p className="text-sm">
          {sync.phase === "offline" ? "غير متصل بالنت." : sync.phase === "syncing" ? "جارٍ المزامنة…" : "متصل."}{" "}
          {sync.lastSyncedAt ? `آخر مزامنة: ${new Date(sync.lastSyncedAt).toLocaleString("ar-EG")}` : "لسه ما حصلتش مزامنة في الجلسة دي."}
        </p>
        <p className="mt-2 text-sm text-muted">
          {data ? data.pending.length : 0} تغيير في انتظار الإرسال{(data?.pending.length ?? 0) > 0 ? " — بيتبعتوا لوحدهم لما الاتصال يرجع." : "."}
        </p>
        <Button className="mt-3" size="sm" onClick={() => void syncRunner.syncNow()} disabled={sync.phase === "syncing"}>
          زامن دلوقتي
        </Button>
        {sync.error ? <p role="alert" className="mt-2 text-xs text-red-700">آخر محاولة فشلت: {sync.error}</p> : null}
      </section>

      {data && data.issues.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line px-4 py-8 text-center text-sm text-muted">مفيش تغييرات محتاجة مراجعة.</p>
      ) : null}

      <ul className="space-y-4">
        {(data?.issues ?? []).map((issue) => (
          <li key={issue.item.id} className="rounded-2xl border border-red-300 bg-elevated p-4">
            <h2 className="text-base font-semibold">{issue.patientName}</h2>
            <p className="mt-1 text-sm leading-7">{describeReason(issue.item.reason, issue.item.entity)}</p>

            {issue.diff.length > 0 ? (
              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-start text-xs text-muted">
                      <th className="py-1 text-start font-medium">الحقل</th>
                      <th className="py-1 text-start font-medium">تعديلك</th>
                      <th className="py-1 text-start font-medium">على الخادم دلوقتي</th>
                    </tr>
                  </thead>
                  <tbody>
                    {issue.diff.map((row) => (
                      <tr key={row.label} className="border-t border-line">
                        <td className="py-1.5 pe-2">{row.label}</td>
                        <td className="py-1.5 pe-2">{row.mine}</td>
                        <td className="py-1.5">{row.server}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : issue.serverReport ? (
              <p className="mt-2 text-xs text-muted">مفيش فرق ظاهر بين تعديلك ونسخة الخادم.</p>
            ) : null}

            <div className="mt-4 flex flex-wrap gap-2">
              {canReapply(issue.item) ? (
                <Button size="sm" disabled={busy === issue.item.id} onClick={() => void reapply(issue)}>
                  طبّق تعديلي فوق النسخة الجديدة
                </Button>
              ) : null}
              <Button size="sm" variant="secondary" disabled={busy === issue.item.id} onClick={() => void discard(issue)}>
                اترك نسخة الخادم (تجاهل تعديلي)
              </Button>
              {issue.serverReport ? (
                <Link to="/reports/$id" params={{ id: issue.item.entityId }} className="inline-flex h-9 items-center text-sm text-teal hover:underline">
                  افتح التقرير
                </Link>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </AppShell>
  );
}
