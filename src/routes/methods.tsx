import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { ArrowRight, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { listLabCatalog, type LabCatalogRow } from "@/lib/lab-catalog";
import { getCurrentLab, type LabProfileData } from "@/lib/lab-access";

export const Route = createFileRoute("/methods")({
  loader: async () => {
    try {
      const [lab, items] = await Promise.all([getCurrentLab(), listLabCatalog()]);
      return { lab, items };
    } catch {
      return { lab: null as LabProfileData | null, items: [] as LabCatalogRow[] };
    }
  },
  component: MethodsPage,
});

/** "How is this test done?" — read-only for everyone; editing lives in the catalog. */
function MethodsPage() {
  const { lab, items } = Route.useLoaderData();
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

      <div className="rounded-2xl border border-line bg-elevated p-4">
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
          {lab.role !== "viewer" ? " · تضيف أو تعدّل الطريقة من «دليل التحاليل»." : ""}
        </p>
      </div>

      <ul className="mt-4 space-y-2">
        {results.map((item) => {
          const method = item.method_info?.trim();
          return (
            <li key={item.id} className="rounded-xl border border-line bg-elevated">
              <details className="group">
                <summary className="flex min-h-12 cursor-pointer select-none items-center justify-between gap-2 px-4 py-3">
                  <span className="text-sm font-medium">
                    {item.test_name} <Badge className="ms-1">{item.category_name_ar}</Badge>
                  </span>
                  <span className="shrink-0 text-xs text-muted">{method ? "طريقة العمل ✓" : "غير مسجّلة"}</span>
                </summary>
                <div className="border-t border-line px-4 py-3 text-sm">
                  {method ? (
                    <p className="whitespace-pre-wrap leading-7">{method}</p>
                  ) : (
                    <p className="leading-6 text-muted">لسه محدش سجّل طريقة العمل لهذا التحليل.</p>
                  )}
                  {lab.role !== "viewer" ? (
                    <Link to="/catalog" className="mt-2 inline-block text-xs text-teal hover:underline">
                      {method ? "تعديل من الكتالوج" : "إضافة من الكتالوج"}
                    </Link>
                  ) : null}
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
