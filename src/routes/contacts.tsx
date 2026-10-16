import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { MessageCircle, Pencil, Phone, Plus, Search, Stethoscope, Trash2, Building2 } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { getCurrentLab, type LabProfileData } from "@/lib/lab-access";
import {
  createContact,
  deleteContact,
  listContacts,
  updateContact,
  type Contact,
  type ContactKind,
} from "@/lib/contacts";
import { toWhatsAppNumber } from "@/lib/phone";
import { cn } from "@/lib/utils";

type Loaded = {
  lab: LabProfileData | null;
  denied: boolean;
  contacts: Contact[];
  canEdit: boolean;
  canDelete: boolean;
};

export const Route = createFileRoute("/contacts")({
  ssr: false,
  loader: async (): Promise<Loaded> => {
    let lab: LabProfileData | null = null;
    try {
      lab = await getCurrentLab();
    } catch {
      return { lab: null, denied: false, contacts: [], canEdit: false, canDelete: false };
    }
    try {
      const res = await listContacts();
      return { lab, denied: false, ...res };
    } catch {
      return { lab, denied: true, contacts: [], canEdit: false, canDelete: false };
    }
  },
  component: ContactsPage,
});

const KIND_LABEL: Record<ContactKind, string> = { doctor: "الأطباء", client: "العملاء" };
type Draft = { id: string | null; name: string; specialty: string; phone: string; notes: string };
const EMPTY: Draft = { id: null, name: "", specialty: "", phone: "", notes: "" };

function ContactsPage() {
  const loaded = Route.useLoaderData();
  const [items, setItems] = useState<Contact[]>(loaded.contacts);
  const [kind, setKind] = useState<ContactKind>("doctor");
  const [q, setQ] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const shown = useMemo(() => {
    const term = q.trim().toLowerCase();
    return items
      .filter((c) => c.kind === kind)
      .filter((c) => !term || `${c.name} ${c.specialty ?? ""} ${c.phone ?? ""}`.toLowerCase().includes(term));
  }, [items, kind, q]);

  if (!loaded.lab) return <Navigate to="/login" replace />;

  if (loaded.denied) {
    return (
      <AppShell>
        <div className="rounded-xl border border-dashed border-line bg-elevated p-6 text-sm leading-7 text-muted">
          ملكش صلاحية عرض الأطباء والعملاء. اطلبها من مالك المعمل.
          <div className="mt-3">
            <Link to="/lab" className="text-teal hover:underline">رجوع للوحة المعمل</Link>
          </div>
        </div>
      </AppShell>
    );
  }

  async function refresh() {
    const fresh = await listContacts();
    setItems(fresh.contacts);
  }

  async function save() {
    if (!draft) return;
    setBusy(true);
    setMessage(null);
    try {
      const payload = { kind, name: draft.name, specialty: draft.specialty, phone: draft.phone, notes: draft.notes };
      if (draft.id) await updateContact({ data: { id: draft.id, ...payload } });
      else await createContact({ data: payload });
      await refresh();
      setDraft(null);
      setMessage({ ok: true, text: "تم الحفظ." });
    } catch (err) {
      setMessage({ ok: false, text: err instanceof Error ? err.message : "تعذر الحفظ" });
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(c: Contact) {
    setBusy(true);
    setMessage(null);
    try {
      await updateContact({
        data: { id: c.id, kind: c.kind, name: c.name, specialty: c.specialty, phone: c.phone, notes: c.notes, isActive: !c.isActive },
      });
      await refresh();
    } catch (err) {
      setMessage({ ok: false, text: err instanceof Error ? err.message : "تعذر التعديل" });
    } finally {
      setBusy(false);
    }
  }

  async function remove(c: Contact) {
    if (!window.confirm(`حذف «${c.name}»؟`)) return;
    setBusy(true);
    setMessage(null);
    try {
      await deleteContact({ data: { id: c.id } });
      await refresh();
    } catch (err) {
      setMessage({ ok: false, text: err instanceof Error ? err.message : "تعذر الحذف" });
    } finally {
      setBusy(false);
    }
  }

  const singular = kind === "doctor" ? "طبيب" : "عميل";

  return (
    <AppShell>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-2xl font-semibold">الأطباء والعملاء</h1>
        <div className="inline-flex overflow-hidden rounded-lg border border-line text-sm" role="tablist">
          {(["doctor", "client"] as const).map((k) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={kind === k}
              onClick={() => {
                setKind(k);
                setDraft(null);
              }}
              className={cn("inline-flex min-h-10 items-center gap-2 px-4", kind === k ? "bg-teal text-white" : "bg-elevated text-ink-soft")}
            >
              {k === "doctor" ? <Stethoscope className="size-4" /> : <Building2 className="size-4" />}
              {KIND_LABEL[k]}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative min-w-52 flex-1">
          <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`ابحث عن ${singular}…`} className="ps-9" />
        </div>
        {loaded.canEdit ? (
          <Button type="button" onClick={() => setDraft({ ...EMPTY })} disabled={busy}>
            <Plus className="size-4" />
            إضافة {singular}
          </Button>
        ) : null}
      </div>

      {message ? (
        <p className={cn("mb-4 rounded-lg border px-3 py-2 text-sm", message.ok ? "border-ok/20 bg-ok/5 text-ok" : "border-high/20 bg-high/5 text-high")}>
          {message.text}
        </p>
      ) : null}

      {draft ? (
        <section className="mb-4 space-y-3 app-card p-4">
          <h2 className="text-sm font-semibold">{draft.id ? `تعديل ${singular}` : `إضافة ${singular}`}</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <Input aria-label="الاسم" placeholder={kind === "doctor" ? "اسم الطبيب" : "اسم العميل (عيادة، مركز، شركة)"} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
            <Input aria-label="التخصص" placeholder={kind === "doctor" ? "التخصص" : "النوع أو التفاصيل"} value={draft.specialty} onChange={(e) => setDraft({ ...draft, specialty: e.target.value })} />
            <Input aria-label="الهاتف" inputMode="tel" dir="ltr" placeholder="رقم الهاتف" value={draft.phone} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} className="text-end" />
          </div>
          <Textarea aria-label="ملاحظات" placeholder="ملاحظات (اختياري)" value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} />
          <div className="flex gap-2">
            <Button type="button" onClick={save} disabled={busy}>حفظ</Button>
            <Button type="button" variant="secondary" onClick={() => setDraft(null)} disabled={busy}>إلغاء</Button>
          </div>
        </section>
      ) : null}

      {shown.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line px-4 py-10 text-center text-sm text-muted">
          {q ? "مفيش نتائج للبحث." : `لسه مضفتش ${KIND_LABEL[kind]}.`}
        </p>
      ) : (
        <ul className="divide-y divide-line overflow-hidden app-card">
          {shown.map((c) => {
            const wa = toWhatsAppNumber(c.phone);
            return (
              <li key={c.id} className={cn("flex flex-wrap items-center gap-3 px-4 py-3", !c.isActive && "opacity-60")}>
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-teal/10 text-teal">
                  {c.kind === "doctor" ? <Stethoscope className="size-5" /> : <Building2 className="size-5" />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{c.name}</p>
                  <p className="mt-0.5 truncate text-xs text-muted">
                    {[c.specialty, c.notes].filter(Boolean).join(" · ") || "—"}
                  </p>
                </div>
                {c.phone ? (
                  <span className="flex items-center gap-1.5">
                    <a href={`tel:${c.phone}`} dir="ltr" className="inline-flex items-center gap-1 text-xs text-ink-soft hover:text-teal">
                      <Phone className="size-3.5" />
                      {c.phone}
                    </a>
                    {wa ? (
                      <a href={`https://wa.me/${wa}`} target="_blank" rel="noreferrer" aria-label="واتساب" className="text-ok">
                        <MessageCircle className="size-4" />
                      </a>
                    ) : null}
                  </span>
                ) : null}
                {loaded.canEdit ? (
                  <span className="flex items-center gap-1">
                    <button
                      type="button"
                      aria-label="تعديل"
                      className="grid size-9 place-items-center rounded-lg text-ink-soft hover:bg-paper-2"
                      onClick={() => setDraft({ id: c.id, name: c.name, specialty: c.specialty ?? "", phone: c.phone ?? "", notes: c.notes ?? "" })}
                    >
                      <Pencil className="size-4" />
                    </button>
                    <button type="button" className="rounded-lg px-2 py-1.5 text-xs text-ink-soft hover:bg-paper-2" onClick={() => void toggleActive(c)} disabled={busy}>
                      {c.isActive ? "إيقاف" : "تفعيل"}
                    </button>
                    {loaded.canDelete ? (
                      <button type="button" aria-label="حذف" className="grid size-9 place-items-center rounded-lg text-high hover:bg-high-bg" onClick={() => void remove(c)} disabled={busy}>
                        <Trash2 className="size-4" />
                      </button>
                    ) : null}
                  </span>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </AppShell>
  );
}
