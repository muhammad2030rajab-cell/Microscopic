import { useEffect, useState, type FormEvent } from "react";
import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { ArrowRight, Copy, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getCurrentPlatformPermissions, isPlatformAdmin } from "@/lib/platform-admin";
import { createLicenseSerial, disableLicenseSerial, listLicenseSerials, resetLicenseSerial, type LicenseSerialSummary } from "@/lib/license-serials";

export const Route = createFileRoute("/admin/licenses")({
  loader: async () => {
    try {
      const [isAdmin, access] = await Promise.all([isPlatformAdmin(), getCurrentPlatformPermissions()]);
      const isSuper = access.isSuper === true;
      return { isAdmin, isSuper, serials: isSuper ? await listLicenseSerials() : [] };
    } catch {
      return { isAdmin: false, isSuper: false, serials: [] as LicenseSerialSummary[] };
    }
  },
  component: AdminLicensesPage,
});

const STATUS: Record<LicenseSerialSummary["status"], string> = { unused: "لم يُستخدم", active: "مُفعّل", disabled: "متوقف" };

function AdminLicensesPage() {
  const { isAdmin, isSuper, serials: initial } = Route.useLoaderData();
  const [serials, setSerials] = useState<LicenseSerialSummary[]>(initial);
  const [note, setNote] = useState("");
  const [fresh, setFresh] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => setSerials(initial), [initial]);
  if (!isAdmin) return <Navigate to="/login" replace />;
  if (!isSuper) return <Navigate to="/admin" replace />;

  async function reload() {
    setSerials(await listLicenseSerials());
  }

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(""); setFresh(""); setLoading(true);
    try {
      const made = await createLicenseSerial({ data: { note } });
      setFresh(made.serial);
      setNote("");
      await reload();
    } catch {
      setError("تعذر إنشاء الرقم. جرّب تاني");
    } finally {
      setLoading(false);
    }
  }

  async function act(fn: () => Promise<unknown>, confirmText: string) {
    if (!window.confirm(confirmText)) return;
    setError("");
    try {
      await fn();
      await reload();
    } catch {
      setError("تعذر تنفيذ العملية");
    }
  }

  return (
    <main className="mx-auto max-w-3xl space-y-6 px-4 py-8">
      <Link to="/admin" className="inline-flex items-center gap-1 text-sm text-muted hover:text-ink"><ArrowRight className="size-4" />لوحة الإدارة</Link>
      <header className="flex items-center gap-3">
        <div className="grid size-11 place-items-center rounded-xl bg-teal/10 text-teal"><KeyRound className="size-5" /></div>
        <div>
          <h1 className="font-display text-2xl font-semibold">أرقام تسجيل البرنامج</h1>
          <p className="text-sm text-muted">رقم لكل عملية بيع. أول جهاز يستخدمه يتربط به للأبد.</p>
        </div>
      </header>

      <form onSubmit={create} className="space-y-3 rounded-2xl border border-line bg-elevated p-4">
        <div className="space-y-1.5">
          <Label htmlFor="note">اسم المعمل (لتتذكره)</Label>
          <Input id="note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={120} />
        </div>
        <Button type="submit" disabled={loading}>{loading ? "جارٍ الإنشاء…" : "إنشاء رقم تسجيل جديد"}</Button>
        {fresh ? (
          <div className="rounded-lg border border-teal/30 bg-teal/5 p-3">
            <p className="text-xs text-muted">انسخه وابعته للعميل دلوقتي. مش هيظهر تاني كامل.</p>
            <p dir="ltr" className="mt-1 select-all font-mono text-lg tracking-wider">{fresh}</p>
            <Button type="button" variant="outline" size="sm" className="mt-2" onClick={() => void navigator.clipboard?.writeText(fresh)}><Copy className="me-1 size-4" />نسخ</Button>
          </div>
        ) : null}
        {error ? <p className="text-sm text-high">{error}</p> : null}
      </form>

      <section className="space-y-2">
        {serials.length === 0 ? <p className="text-sm text-muted">لسه مفيش أرقام.</p> : null}
        {serials.map((s) => (
          <div key={s.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-elevated p-3">
            <div className="min-w-0">
              <p className="font-medium">{s.note || "بدون اسم"} <span dir="ltr" className="font-mono text-xs text-muted">…{s.last4}</span></p>
              <p className="text-xs text-muted">
                {STATUS[s.status]}
                {s.machine ? <> · الجهاز <span dir="ltr" className="font-mono">{s.machine}</span></> : null}
                {s.activatedAt ? ` · ${s.activatedAt.slice(0, 10)}` : ""}
              </p>
            </div>
            <div className="flex gap-2">
              {s.status === "active" ? (
                <Button size="sm" variant="outline" onClick={() => void act(() => resetLicenseSerial({ data: { id: s.id } }), "العميل غيّر جهازه؟ ده هيفك الرقم من الجهاز القديم عشان يتفعّل على الجديد.")}>نقل لجهاز جديد</Button>
              ) : null}
              {s.status === "unused" ? (
                <Button size="sm" variant="outline" onClick={() => void act(() => disableLicenseSerial({ data: { id: s.id } }), "إيقاف الرقم ده نهائياً؟")}>إيقاف</Button>
              ) : null}
            </div>
          </div>
        ))}
      </section>
    </main>
  );
}
