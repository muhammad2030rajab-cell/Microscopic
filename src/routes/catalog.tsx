import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { Search, Settings2 } from "lucide-react";
import { Fragment, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { listLabCatalog, updateLabCatalogItem, updateLabCatalogMethod, METHOD_INFO_MAX_LENGTH, type LabCatalogRow } from "@/lib/lab-catalog";
import { getCurrentLab } from "@/lib/lab-access";
import { parseAgeRanges } from "@/lib/age-ranges";

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
  const [openAge, setOpenAge] = useState<string | null>(null);
  const [openMethod, setOpenMethod] = useState<string | null>(null);
  const [savingMethod, setSavingMethod] = useState<string | null>(null);
  const [savedMethod, setSavedMethod] = useState<string | null>(null);
  const [methodError, setMethodError] = useState<{ id: string; message: string } | null>(null);
  const [saveError, setSaveError] = useState<{ id: string; message: string } | null>(null);

  const categories = useMemo(() => Array.from(new Map(items.map((x) => [x.category_id, { id: x.category_id, ar: x.category_name_ar }])).values()), [items]);
  const results = useMemo(() => items.filter((x) =>
    (cat === "all" || x.category_id === cat) &&
    (!q.trim() || `${x.test_name} ${x.category_name_ar} ${x.category_name_en}`.toLowerCase().includes(q.trim().toLowerCase()))
  ), [items, q, cat]);

  if (!lab) return <NavigateToLogin />;

  async function save(item: LabCatalogRow) {
    setSaveError(null);
    const parsed = parseAgeRanges(item.age_ranges);
    if (!parsed.ok) {
      setOpenAge(item.id);
      setSaveError({ id: item.id, message: parsed.error });
      return;
    }
    setSaving(item.id);
    try {
      await updateLabCatalogItem({ data: { id: item.id, unit: item.unit, maleRange: item.male_range, femaleRange: item.female_range, ageRanges: item.age_ranges, isActive: item.is_active } });
    } catch (error) {
      setSaveError({ id: item.id, message: error instanceof Error ? error.message : "تعذر الحفظ" });
    } finally { setSaving(null); }
  }

  // Method notes: every lab user except "viewer" can write them (not only the owner).
  const canEditMethod = lab?.role !== "viewer";

  async function saveMethod(item: LabCatalogRow) {
    setMethodError(null);
    setSavedMethod(null);
    if ((item.method_info ?? "").length > METHOD_INFO_MAX_LENGTH) {
      setMethodError({ id: item.id, message: `الحد الأقصى ${METHOD_INFO_MAX_LENGTH} حرف` });
      return;
    }
    setSavingMethod(item.id);
    try {
      await updateLabCatalogMethod({ data: { id: item.id, methodInfo: item.method_info } });
      setSavedMethod(item.id);
    } catch (error) {
      setMethodError({ id: item.id, message: error instanceof Error ? error.message : "تعذر الحفظ" });
    } finally { setSavingMethod(null); }
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
            <tbody>{results.map((item) => <Fragment key={item.id}><tr className="border-t border-line align-top">
              <td className="px-4 py-3"><div className="font-medium">{item.test_name}</div><Badge className="mt-1">{item.category_name_ar}</Badge>{lab.role === "owner" || item.age_ranges ? <button type="button" onClick={() => setOpenAge(openAge === item.id ? null : item.id)} aria-expanded={openAge === item.id} className="mt-2 block text-xs text-teal underline-offset-2 hover:underline">{item.age_ranges ? `نطاقات حسب السن (${(parseAgeRanges(item.age_ranges).ok ? (parseAgeRanges(item.age_ranges) as { bands: unknown[] }).bands.length : "!")})` : "+ نطاقات حسب السن"}</button> : null}{canEditMethod || item.method_info ? <button type="button" onClick={() => setOpenMethod(openMethod === item.id ? null : item.id)} aria-expanded={openMethod === item.id} className="mt-2 block text-xs text-teal underline-offset-2 hover:underline">{item.method_info ? "طريقة العمل ✓" : "+ طريقة العمل"}</button> : null}</td>
              <td className="px-4 py-3">{lab.role === "owner" ? <Input value={item.unit} onChange={(e) => patch(item.id, { unit: e.target.value })} /> : item.unit || "—"}</td>
              <td className="px-4 py-3">{lab.role === "owner" ? <Input value={item.male_range} onChange={(e) => patch(item.id, { male_range: e.target.value })} /> : item.male_range}</td>
              <td className="px-4 py-3">{lab.role === "owner" ? <Input value={item.female_range} onChange={(e) => patch(item.id, { female_range: e.target.value })} /> : item.female_range}</td>
              <td className="px-4 py-3">{lab.role === "owner" ? <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={item.is_active} onChange={(e) => patch(item.id, { is_active: e.target.checked })} /> {item.is_active ? "مفعل" : "متوقف"}</label> : <Badge>{item.is_active ? "مفعل" : "متوقف"}</Badge>}</td>
              <td className="px-4 py-3">{lab.role === "owner" ? <button disabled={saving === item.id} onClick={() => save(item)} className="rounded-lg bg-ink px-3 py-2 text-xs text-paper disabled:opacity-50">{saving === item.id ? "جارٍ الحفظ…" : "حفظ"}</button> : <span className="text-xs text-muted">عرض فقط</span>}</td>
            </tr>
            {openAge === item.id ? <tr className="bg-paper-2/40"><td colSpan={6} className="px-4 py-3">
              <label className="block text-xs font-medium" htmlFor={`age-${item.id}`}>نطاقات حسب السن — {item.test_name}</label>
              {lab.role === "owner" ? <textarea id={`age-${item.id}`} dir="ltr" rows={4} value={item.age_ranges ?? ""} onChange={(e) => { patch(item.id, { age_ranges: e.target.value }); setSaveError(null); }} placeholder={"0-28d: 14-24\n1mo-12mo: 9.5-14\n1-12: 11.5-15.5\n12-18 ذكر: 13-16\n65+: 12-16.5"} className="mt-1 w-full rounded-sm border border-line bg-elevated p-2 font-mono text-xs" /> : <pre dir="ltr" className="mt-1 whitespace-pre-wrap font-mono text-xs">{item.age_ranges}</pre>}
              <p className="mt-1 text-[11px] leading-5 text-muted">سطر لكل نطاق: <span dir="ltr" className="font-mono">من-إلى: المدى</span> بالسنوات، والحد الأعلى غير مشمول (12-18 = من 12 لحد 17). للنوع أضف ذكر أو أنثى بعد السن. لو السن مش مغطى بيتطبق مدى الذكر/الأنثى العادي. للرضّع: <span dir="ltr" className="font-mono">0-28d: ...</span> بالأيام و<span dir="ltr" className="font-mono">1mo-12mo: ...</span> بالشهور. اكتب المدى من كيت/جهاز معملك.</p>
              {(() => { const v = parseAgeRanges(item.age_ranges); const msg = saveError?.id === item.id ? saveError.message : !v.ok ? v.error : null; return msg ? <p role="alert" className="mt-1 text-xs text-high">{msg}</p> : null; })()}
            </td></tr> : null}
            {openMethod === item.id ? <tr className="bg-paper-2/40"><td colSpan={6} className="px-4 py-3">
              <label className="block text-xs font-medium" htmlFor={`method-${item.id}`}>طريقة العمل — {item.test_name}</label>
              {canEditMethod ? <textarea id={`method-${item.id}`} rows={6} maxLength={METHOD_INFO_MAX_LENGTH} value={item.method_info ?? ""} onChange={(e) => { patch(item.id, { method_info: e.target.value }); setMethodError(null); setSavedMethod(null); }} placeholder={"الطريقة: Enzymatic colorimetric\nالكيت / الشركة / اللوت:\nنوع العينة وحجمها:\nخطوات التشغيل (الحضانة، طول الموجة):\nحدود الخطية وطريقة الحساب:"} className="mt-1 w-full rounded-sm border border-line bg-elevated p-2 text-xs" /> : <pre className="mt-1 whitespace-pre-wrap text-xs">{item.method_info}</pre>}
              <p className="mt-1 text-[11px] leading-5 text-muted">انسخ المعلومات من بامفلت الكيت. متاحة لكل مستخدمي المعمل، ويقدر يعدّلها أي مستخدم ما عدا حساب المشاهدة فقط.</p>
              {methodError?.id === item.id ? <p role="alert" className="mt-1 text-xs text-high">{methodError.message}</p> : null}
              {canEditMethod ? <div className="mt-2 flex items-center gap-3"><button type="button" disabled={savingMethod === item.id} onClick={() => saveMethod(item)} className="rounded-lg bg-ink px-3 py-2 text-xs text-paper disabled:opacity-50">{savingMethod === item.id ? "جارٍ الحفظ…" : "حفظ الطريقة"}</button>{savedMethod === item.id ? <span className="text-xs text-muted">اتحفظت</span> : null}</div> : null}
            </td></tr> : null}
            </Fragment>)}</tbody>
          </table>
        </div>
        <div className="mt-4 flex items-center gap-2 text-xs text-muted"><Settings2 className="size-4" /> التعديلات محفوظة لكل معمل بشكل مستقل.</div>
      </div>
    </main>
  );
}
