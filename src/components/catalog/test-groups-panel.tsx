import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { LabCatalogRow } from "@/lib/lab-catalog";
import { loadBootstrap } from "@/lib/offline/bootstrap-cache";
import { deleteLabTestGroup, listLabTestGroups, saveLabTestGroup } from "@/lib/lab-test-groups";
import { groupErrorMessage, MAX_GROUP_NAME, resolveGroupTests, type TestGroup } from "@/lib/test-groups";

type Editing = { id?: string; name: string; ids: string[] };

/**
 * The lab's ready-made test groups (e.g. "CHECKUP 1"). Everyone can see them; only the owner changes them.
 * Changing groups needs a connection (the new-report screen keeps its own offline copy of the list).
 */
export function TestGroupsPanel({ items, isOwner }: { items: LabCatalogRow[]; isOwner: boolean }) {
  const [groups, setGroups] = useState<TestGroup[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    listLabTestGroups()
      .then((g) => alive && setGroups(g))
      .catch(() => {
        if (!alive) return;
        // No connection: show the copy this device saved the last time it opened "new report".
        const saved = loadBootstrap<unknown, unknown, TestGroup>()?.groups;
        if (saved && saved.length) setGroups(saved);
        else setLoadFailed(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  const active = useMemo(() => items.filter((i) => i.is_active), [items]);
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? active.filter((i) => i.test_name.toLowerCase().includes(q) || i.category_name_ar.includes(q) || i.category_name_en.toLowerCase().includes(q)) : active;
  }, [active, query]);
  const byCategory = useMemo(() => {
    const map = new Map<string, { label: string; rows: LabCatalogRow[] }>();
    for (const row of shown) {
      const entry = map.get(row.category_id) ?? { label: row.category_name_ar || row.category_name_en, rows: [] };
      entry.rows.push(row);
      map.set(row.category_id, entry);
    }
    return [...map.values()];
  }, [shown]);

  function startEdit(next: Editing) {
    if (!navigator.onLine) {
      setError("تعديل المجموعات محتاج اتصال بالإنترنت.");
      return;
    }
    setError(null);
    setQuery("");
    setEditing(next);
  }

  function toggle(id: string) {
    setEditing((e) => (e ? { ...e, ids: e.ids.includes(id) ? e.ids.filter((x) => x !== id) : [...e.ids, id] } : e));
  }

  async function save() {
    if (!editing) return;
    if (!navigator.onLine) return setError("الحفظ محتاج اتصال بالإنترنت.");
    setBusy(true);
    setError(null);
    try {
      const saved = await saveLabTestGroup({ data: { id: editing.id, name: editing.name, catalogIds: editing.ids } });
      setGroups((list) => [...(list ?? []).filter((g) => g.id !== saved.id), saved].sort((a, b) => a.name.localeCompare(b.name, "ar")));
      setEditing(null);
    } catch (e) {
      setError(groupErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function remove(group: TestGroup) {
    if (!navigator.onLine) return setError("الحذف محتاج اتصال بالإنترنت.");
    if (!window.confirm(`حذف مجموعة «${group.name}»؟ التحاليل نفسها مش هتتأثر.`)) return;
    setBusy(true);
    setError(null);
    try {
      await deleteLabTestGroup({ data: { id: group.id } });
      setGroups((list) => (list ?? []).filter((g) => g.id !== group.id));
    } catch (e) {
      setError(groupErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mb-5 rounded-2xl border border-line bg-elevated p-4 sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-base font-semibold">مجموعات التحاليل</h2>
          <p className="mt-1 text-xs text-muted">مجموعة جاهزة (زي CHECKUP 1) بتضيف كل تحاليلها مرة واحدة وإنت بتعمل تقرير جديد.</p>
        </div>
        {isOwner && !editing ? (
          <Button size="sm" onClick={() => startEdit({ name: "", ids: [] })}>
            مجموعة جديدة
          </Button>
        ) : null}
      </div>

      {error ? <p className="mt-3 text-sm text-high">{error}</p> : null}

      {editing ? (
        <div className="mt-4 space-y-3">
          <Input value={editing.name} maxLength={MAX_GROUP_NAME} onChange={(e) => setEditing({ ...editing, name: e.target.value })} placeholder="اسم المجموعة" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="ابحث عن تحليل أو قسم" />
          <div className="max-h-72 space-y-3 overflow-y-auto rounded-lg border border-line p-3">
            {byCategory.length === 0 ? <p className="text-sm text-muted">مفيش تحاليل مطابقة.</p> : null}
            {byCategory.map((cat) => (
              <div key={cat.label}>
                <p className="mb-1 text-xs font-medium text-ink-soft">{cat.label}</p>
                <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
                  {cat.rows.map((row) => (
                    <label key={row.id} className="flex items-center gap-2 text-sm">
                      <input type="checkbox" checked={editing.ids.includes(row.id)} onChange={() => toggle(row.id)} />
                      <span dir="auto">{row.test_name}</span>
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs text-muted">{editing.ids.length} تحليل مختار</span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => { setEditing(null); setError(null); }} disabled={busy}>
                إلغاء
              </Button>
              <Button size="sm" onClick={save} disabled={busy}>
                {busy ? "جاري الحفظ…" : "حفظ المجموعة"}
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <div className="mt-3 space-y-2">
          {loadFailed ? <p className="text-sm text-muted">تعذر تحميل المجموعات (محتاجة اتصال بالإنترنت).</p> : null}
          {!loadFailed && groups === null ? <p className="text-sm text-muted">جاري التحميل…</p> : null}
          {groups && groups.length === 0 ? <p className="text-sm text-muted">{isOwner ? "لسه مفيش مجموعات. اضغط «مجموعة جديدة» لإنشاء أول واحدة." : "لسه مفيش مجموعات."}</p> : null}
          {(groups ?? []).map((g) => {
            const { tests, missing } = resolveGroupTests(g.catalogIds, items);
            return (
              <div key={g.id} className="flex items-center justify-between gap-3 rounded-lg border border-line px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{g.name}</p>
                  <p className="text-xs text-muted">
                    {tests.length} تحليل{missing ? ` · ${missing} غير متاح (معطّل أو اتحذف)` : ""}
                  </p>
                </div>
                {isOwner ? (
                  <div className="flex shrink-0 gap-2">
                    <Button variant="outline" size="sm" onClick={() => startEdit({ id: g.id, name: g.name, ids: g.catalogIds })} disabled={busy}>
                      تعديل
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => remove(g)} disabled={busy}>
                      حذف
                    </Button>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
