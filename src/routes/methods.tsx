import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { ArrowRight, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { listLabCatalog, updateLabCatalogMethod, METHOD_INFO_MAX_LENGTH, type LabCatalogRow } from "@/lib/lab-catalog";
import { getCurrentLab, type LabProfileData } from "@/lib/lab-access";
import { loadLocalCatalog } from "@/lib/sync-engine/offline-fallback";

export const Route = createFileRoute("/methods")({
  // Loads in the browser so the saved offline copy of this page is an empty shell, and so that with no
  // connection the loader can answer from the device copy (read-only: method notes are saved online only).
  ssr: false,
  loader: async () => {
    try {
      const [lab, items] = await Promise.all([getCurrentLab(), listLabCatalog()]);
      return { lab, items, offline: false };
    } catch (error) {
      if (typeof window !== "undefined") {
        const local = await loadLocalCatalog<LabProfileData>(error);
        if (local) return { lab: local.lab as LabProfileData | null, items: local.items, offline: true };
      }
      return { lab: null as LabProfileData | null, items: [] as LabCatalogRow[], offline: false };
    }
  },
  component: MethodsPage,
});

/** "How is this test done?" — its own section; every lab user except "viewer" can write the notes here. */
function MethodsPage() {
  const { lab, items: loaded, offline } = Route.useLoaderData();
  const [items, setItems] = useState(loaded);
  const [saving, setSaving] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [err, setErr] = useState<{ id: string; message: string } | null>(null);
  const canEdit = lab?.role !== "viewer" && !offline;
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("all");
  const [onlyWithMethod, setOnlyWithMethod] = useState(false);

  const categories = useMemo(
    () => Array.from(new Map(items.map((x) => [x.category_id, { id: x.category_id, ar: x.category_name_ar }])).values()),
    [items],
  );
  const withMethod = useMemo(() => items.filter((x) => x.method_info?.trim()).length, [items]);
  const results = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return items.filter(
      (x) =>
        (cat === "all" || x.category_id === cat) &&
        (!onlyWithMethod || Boolean(x.method_info?.trim())) &&
        (!needle || `${x.test_name} ${x.category_name_ar} ${x.category_name_en}`.toLowerCase().includes(needle)),
    );
  }, [items, q, cat, onlyWithMethod]);

  if (!lab) return <Navigate to="/login" replace />;

  function setMethod(id: string, value: string) {
    setItems((prev) => prev.map((x) => (x.id === id ? { ...x, method_info: value } : x)));
    setErr(null);
    setSaved(null);
  }

  async function saveMethod(item: LabCatalogRow) {
    setErr(null);
    setSaved(null);
    if ((item.method_info ?? "").length > METHOD_INFO_MAX_LENGTH) {
      setErr({ id: item.id, message: `الحد الأقصى ${METHOD_INFO_MAX_LENGTH} حرف` });
      return;
    }
    setSaving(item.id);
    try {
      await updateLabCatalogMethod({ data: { id: item.id, methodInfo: item.method_info } });
      setSaved(item.id);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      setErr({ id: item.id, message: msg === "METHOD_EDIT_NOT_ALLOWED" ? "ليس لديك صلاحية تعديل الطريقة." : msg || "تعذر الحفظ" });
    } finally {
      setSaving(null);
    }
  }

  return (
    <AppShell>
      <header className="mb-5 flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-muted">Test methods</p>
          <h1 className="mt-1 font-display text-2xl font-semibold sm:text-3xl">كيف يتم التحليل؟</h1>
        </div>
        <Link to="/lab" className="inline-flex items-center gap-2 text-sm text-teal hover:underline">
          <ArrowRight className="size-4" /> لوحة المعمل
        </Link>
      </header>

      {offline ? (
        <p role="status" className="mb-3 rounded-xl border border-dashed border-line bg-elevated px-4 py-3 text-xs leading-6 text-muted">
          إنت شغّال بدون إنترنت: الطرق ظاهرة للقراءة بس. تعديل الطريقة بيحتاج نت.
        </p>
      ) : null}

      <div className="app-card p-4">
        <div className="relative">
          <Search className="pointer-events-none absolute top-3.5 start-3 size-4 text-muted" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ابحث باسم التحليل أو القسم" className="ps-9" />
        </div>
        <div className="mt-3 flex gap-2 overflow-x-auto">
          <button type="button" className={`shrink-0 rounded-full px-3 py-1 text-xs ${cat === "all" ? "bg-ink text-paper" : "border border-line"}`} onClick={() => setCat("all")}>الكل</button>
          {categories.map((c) => (
            <button key={c.id} type="button" className={`shrink-0 rounded-full px-3 py-1 text-xs ${cat === c.id ? "bg-ink text-paper" : "border border-line"}`} onClick={() => setCat(c.id)}>{c.ar}</button>
          ))}
        </div>
        <label className="mt-3 flex items-center gap-2 text-xs">
          <input type="checkbox" checked={onlyWithMethod} onChange={(e) => setOnlyWithMethod(e.target.checked)} />
          اللي ليها طريقة مسجّلة بس
        </label>
        <p className="mt-2 text-xs text-muted">
          {results.length} تحليل · {withMethod} منها ليها طريقة مسجّلة
          {canEdit ? " · افتح أي تحليل واكتب أو عدّل طريقة العمل." : ""}
        </p>
      </div>

      <ul className="mt-4 space-y-2">
        {results.map((item) => {
          const method = item.method_info?.trim();
          return (
            <li key={item.id} className="app-card">
              <details className="group">
                <summary className="flex min-h-12 cursor-pointer select-none items-center justify-between gap-2 px-4 py-3">
                  <span className="text-sm font-medium">
                    {item.test_name} <Badge className="ms-1">{item.category_name_ar}</Badge>
                  </span>
                  <span className="shrink-0 text-xs text-muted">{method ? "طريقة العمل ✓" : "غير مسجّلة"}</span>
                </summary>
                <div className="border-t border-line px-4 py-3 text-sm">
                  {canEdit ? (
                    <>
                      <textarea
                        id={`method-${item.id}`}
                        rows={6}
                        maxLength={METHOD_INFO_MAX_LENGTH}
                        value={item.method_info ?? ""}
                        onChange={(e) => setMethod(item.id, e.target.value)}
                        placeholder={"الطريقة: Enzymatic colorimetric\nالكيت / الشركة / اللوت:\nنوع العينة وحجمها:\nخطوات التشغيل (الحضانة، طول الموجة):\nحدود الخطية وطريقة الحساب:"}
                        className="w-full rounded-sm border border-line bg-elevated p-2 text-xs"
                      />
                      {err?.id === item.id ? <p role="alert" className="mt-1 text-xs text-high">{err.message}</p> : null}
                      <div className="mt-2 flex items-center gap-3">
                        <button type="button" disabled={saving === item.id} onClick={() => void saveMethod(item)} className="rounded-lg bg-ink px-3 py-2 text-xs text-paper disabled:opacity-50">
                          {saving === item.id ? "جارٍ الحفظ…" : "حفظ الطريقة"}
                        </button>
                        {saved === item.id ? <span className="text-xs text-muted">اتحفظت</span> : null}
                      </div>
                    </>
                  ) : method ? (
                    <p className="whitespace-pre-wrap leading-7">{method}</p>
                  ) : (
                    <p className="leading-6 text-muted">لسه محدش سجّل طريقة العمل لهذا التحليل.</p>
                  )}
                </div>
              </details>
            </li>
          );
        })}
        {results.length === 0 ? <li className="rounded-xl border border-dashed border-line px-4 py-8 text-center text-sm text-muted">مفيش نتائج.</li> : null}
      </ul>
    </AppShell>
  );
}
