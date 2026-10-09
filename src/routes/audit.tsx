import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { getCurrentLab, type LabProfileData } from "@/lib/lab-access";
import { listAuditEvents, type AuditEvent } from "@/lib/audit-view";
import { AUDIT_GROUPS } from "@/lib/audit-labels";

type Loaded = { lab: LabProfileData | null; denied: boolean; events: AuditEvent[]; hasMore: boolean };

export const Route = createFileRoute("/audit")({
  loader: async (): Promise<Loaded> => {
    let lab: LabProfileData | null = null;
    try {
      lab = await getCurrentLab();
    } catch {
      return { lab: null, denied: false, events: [], hasMore: false };
    }
    try {
      const first = await listAuditEvents({ data: {} });
      return { lab, denied: false, ...first };
    } catch {
      return { lab, denied: true, events: [], hasMore: false };
    }
  },
  component: AuditPage,
});

function AuditPage() {
  const initial = Route.useLoaderData();
  const [group, setGroup] = useState<string>("all");
  const [events, setEvents] = useState(initial.events);
  const [hasMore, setHasMore] = useState(initial.hasMore);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (!initial.lab) return <Navigate to="/login" replace />;
  if (initial.denied) {
    return (
      <AppShell>
        <div className="rounded-xl border border-dashed border-line bg-elevated p-6 text-sm leading-7 text-muted">
          سجل العمليات لمالك المعمل ومن معاه صلاحية «إدارة المستخدمين».
          <div className="mt-3"><Link to="/lab" className="text-teal hover:underline">رجوع للوحة المعمل</Link></div>
        </div>
      </AppShell>
    );
  }

  async function load(nextGroup: string, append: boolean) {
    setBusy(true);
    setError("");
    try {
      const res = await listAuditEvents({ data: { group: nextGroup, before: append ? events[events.length - 1]?.createdAt : undefined } });
      setEvents(append ? [...events, ...res.events] : res.events);
      setHasMore(res.hasMore);
    } catch {
      setError("تعذر تحميل السجل");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell>
      <h1 className="mb-1 font-display text-2xl font-semibold">سجل العمليات</h1>
      <p className="mb-4 text-sm text-muted">كل إضافة وتعديل وحذف في المعمل، ومين عملها ومتى.</p>
      <div className="mb-4 flex flex-wrap gap-2">
        {AUDIT_GROUPS.map((g) => (
          <button key={g.key} type="button" onClick={() => { setGroup(g.key); void load(g.key, false); }} className={`min-h-10 rounded-full border px-4 text-sm ${group === g.key ? "border-ink bg-ink text-paper" : "border-line bg-elevated text-ink-soft"}`}>{g.label}</button>
        ))}
      </div>
      {error ? <p className="mb-3 rounded-lg border border-high/20 bg-high/5 px-3 py-2 text-sm text-high">{error}</p> : null}
      <section className="rounded-xl border border-line bg-elevated">
        {events.length === 0 ? <p className="p-6 text-center text-sm text-muted">مفيش عمليات مسجّلة هنا.</p> : (
          <ul className="divide-y divide-line">
            {events.map((e) => (
              <li key={e.id} className="flex items-start justify-between gap-3 px-4 py-3 text-sm">
                <div className="min-w-0">
                  <p className="font-medium">{e.label}</p>
                  <p className="text-xs text-muted">{e.actor}</p>
                </div>
                <div className="shrink-0 text-end text-xs text-muted">
                  <p>{new Date(e.createdAt).toLocaleString("ar-EG", { day: "numeric", month: "numeric", hour: "numeric", minute: "2-digit" })}</p>
                  {e.entityType === "report" && e.entityId ? <Link to="/reports/$id" params={{ id: e.entityId }} className="text-teal hover:underline">فتح التقرير</Link> : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
      {hasMore ? <div className="mt-4 text-center"><Button type="button" variant="outline" disabled={busy} onClick={() => void load(group, true)}>{busy ? <Loader2 className="animate-spin" /> : null} عرض الأقدم</Button></div> : null}
    </AppShell>
  );
}
