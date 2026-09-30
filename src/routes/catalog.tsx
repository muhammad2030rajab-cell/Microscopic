import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { Search, Settings2 } from "lucide-react";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { listLabCatalog, updateLabCatalogItem, type LabCatalogRow } from "@/lib/lab-catalog";
import { getCurrentLab } from "@/lib/lab-access";

export const Route = createFileRoute("/catalog")({
  loader: async () => {
    try {
      const [lab, items] = await Promise.all([getCurrentLab(), listLabCatalog()]);
      return { lab, items };
    } catch {
      return { lab: null, items: [] };
    }
  },
  component: CatalogPage,
});

function NavigateToLogin() {
  return <Navigate to="/login" replace />;
}

function CatalogPage() {
  const { lab, items: initialItems } = Route.useLoaderData();
  const [items, setItems] = useState(initialItems);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("all");
  const [saving, setSaving] = useState<string | null>(null);

  const categories = useMemo(() => Array.from(new Map(items.map((x) => [x.category_id, { id: x.category_id, ar: x.category_name_ar }])).values()), [items]);
  const results = useMemo(() => items.filter((x) =>
    (cat === "all" || x.category_id === cat) &&
    (!q.trim() || `${x.test_name} ${x.category_name_ar} ${x.category_name_en}`.toLowerCase().includes(q.trim().toLowerCase()))
  ), [items, q, cat]);

  if (!lab) return <NavigateToLogin />;

  async function save(item: LabCatalogRow) {
    setSaving(item.id);
    try {
      await updateLabCatalogItem({ data: { id: item.id, unit: item.unit, maleRange: item.male_range, femaleRange: item.female_range, isActive: item.is_active } });
    } finally { setSaving(null); }
  }

  function patch(id: string, patch: Partial<LabCatalogRow>) {
    setItems((current) => current.map((x) => x.id === id ? { ...x, ...patch } : x));
  }

  return (
    <main className="min-h-screen bg-paper">
      <header className="border-b border-line bg-elevated">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <div><p className="text-[11px] uppercase tracking-[0.2em] text-muted">Test Catalog</p><h1 className="mt-1 font-display text-xl font-semibold">كتالوج التحاليل</h1></div>
          <Link to="/lab" className="text-sm text-muted hover:text-ink">العودة للوحة المعمل</Link>
        </div>
      </header>
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        <div className="rounded-2xl border border-line bg-elevated p-5">
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="relative flex-1"><Search className="pointer-events-none absolute top-3.5 start-3 size-4 text-muted" /><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ابحث باسم التحليل أو القسم" className="ps-9" /></div>
            <div className="flex gap-2 overflow-x-auto">
              <button className={`rounded-full px-3 text-xs ${cat === "all" ? "bg-ink text-paper" : "border border-line"}`} onClick={() => setCat("all")}>الكل</button>
              {categories.map((c) => <button key={c.id} className={`shrink-0 rounded-full px-3 text-xs ${cat === c.id ? "bg-ink text-paper" : "border border-line"}`} onClick={() => setCat(c.id)}>{c.ar}</button>)}
            </div>
          </div>
          <p className="mt-3 text-xs text-muted">{results.length} تحليل · {lab.role === "owner" ? "يمكنك تعديل الوحدة والمدى الطبيعي وتفعيل/تعطيل التحليل." : "وضع المشاهدة فقط."}</p>
        </div>

        <div className="mt-5 overflow-x-auto rounded-xl border border-line bg-elevated">
          <table className="w-full min-w-[850px] text-sm">
            <thead className="bg-paper-2/70 text-[11px] text-muted"><tr><th className="px-4 py-3 text-start">التحليل</th><th className="px-4 py-3 text-start">الوحدة</th><th className="px-4 py-3 text-start">ذكر</th><th className="px-4 py-3 text-start">أنثى</th><th className="px-4 py-3 text-start">الحالة</th><th className="px-4 py-3 text-start">إجراء</th></tr></thead>
            <tbody>{results.map((item) => <tr key={item.id} className="border-t border-line align-top">
              <td className="px-4 py-3"><div className="font-medium">{item.test_name}</div><Badge className="mt-1">{item.category_name_ar}</Badge></td>
              <td className="px-4 py-3">{lab.role === "owner" ? <Input value={item.unit} onChange={(e) => patch(item.id, { unit: e.target.value })} /> : item.unit || "—"}</td>
              <td className="px-4 py-3">{lab.role === "owner" ? <Input value={item.male_range} onChange={(e) => patch(item.id, { male_range: e.target.value })} /> : item.male_range}</td>
              <td className="px-4 py-3">{lab.role === "owner" ? <Input value={item.female_range} onChange={(e) => patch(item.id, { female_range: e.target.value })} /> : item.female_range}</td>
              <td className="px-4 py-3">{lab.role === "owner" ? <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={item.is_active} onChange={(e) => patch(item.id, { is_active: e.target.checked })} /> {item.is_active ? "مفعل" : "متوقف"}</label> : <Badge>{item.is_active ? "مفعل" : "متوقف"}</Badge>}</td>
              <td className="px-4 py-3">{lab.role === "owner" ? <button disabled={saving === item.id} onClick={() => save(item)} className="rounded-lg bg-ink px-3 py-2 text-xs text-paper disabled:opacity-50">{saving === item.id ? "جارٍ الحفظ…" : "حفظ"}</button> : <span className="text-xs text-muted">عرض فقط</span>}</td>
            </tr>)}</tbody>
          </table>
        </div>
        <div className="mt-4 flex items-center gap-2 text-xs text-muted"><Settings2 className="size-4" /> التعديلات محفوظة لكل معمل بشكل مستقل.</div>
      </div>
    </main>
  );
}
