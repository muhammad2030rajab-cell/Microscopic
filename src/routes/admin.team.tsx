import { useEffect, useState, type FormEvent } from "react";
import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { ArrowRight, Check, CheckCircle2, ChevronDown, ChevronUp, ShieldCheck, Trash2, UserPlus, UserX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  isPlatformAdmin, getCurrentPlatformPermissions, listPlatformAdmins, createPlatformAdmin, updatePlatformAdmin, deletePlatformAdmin,
  ALL_PLATFORM_PERMISSIONS, PLATFORM_PERMISSION_LABELS,
  type PlatformAdminSummary, type PlatformPermission, type PlatformPermissions,
} from "@/lib/platform-admin";

export const Route = createFileRoute("/admin/team")({
  loader: async () => {
    try {
      const [isAdmin, access] = await Promise.all([isPlatformAdmin(), getCurrentPlatformPermissions()]);
      const canManage = access.isSuper || access.permissions["admins.manage"] === true;
      const admins = canManage ? await listPlatformAdmins() : [];
      return { isAdmin, canManage, admins };
    } catch {
      return { isAdmin: false, canManage: false, admins: [] as PlatformAdminSummary[] };
    }
  },
  component: AdminTeamPage,
});

const DEFAULT_NEW_PERMISSIONS: PlatformPermissions = { "labs.create": true };

function AdminTeamPage() {
  const { isAdmin, canManage, admins: initialAdmins } = Route.useLoaderData();
  const [admins, setAdmins] = useState<PlatformAdminSummary[]>(initialAdmins);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [permissions, setPermissions] = useState<PlatformPermissions>(DEFAULT_NEW_PERMISSIONS);
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingPermissions, setEditingPermissions] = useState<PlatformPermissions>({});
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => setAdmins(initialAdmins), [initialAdmins]);

  if (!isAdmin) return <Navigate to="/login" replace />;
  if (!canManage) return <Navigate to="/admin" replace />;

  function toggle(permission: PlatformPermission, current: PlatformPermissions, setter: (v: PlatformPermissions) => void) {
    setter({ ...current, [permission]: current[permission] !== true });
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(""); setSuccess(""); setLoading(true);
    try {
      const created = await createPlatformAdmin({ data: { name, email, password, permissions } });
      setAdmins((current) => [...current, {
        authUserId: created.authUserId, name: created.name, email: created.email,
        isSuper: false, isActive: true, permissions: created.permissions, createdAt: new Date().toISOString(),
      }]);
      setName(""); setEmail(""); setPassword(""); setPermissions(DEFAULT_NEW_PERMISSIONS);
      setSuccess(`تم إنشاء حساب المدير ${created.email} بنجاح ✅`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذر إنشاء الحساب");
    } finally {
      setLoading(false);
    }
  }

  function startEditing(admin: PlatformAdminSummary) {
    setError(""); setSuccess("");
    setEditingId(admin.authUserId);
    setEditingPermissions({ ...admin.permissions });
  }

  async function saveEditing(admin: PlatformAdminSummary) {
    setError(""); setSuccess(""); setLoading(true);
    try {
      await updatePlatformAdmin({ data: { authUserId: admin.authUserId, permissions: editingPermissions } });
      setAdmins((current) => current.map((a) => a.authUserId === admin.authUserId ? { ...a, permissions: editingPermissions } : a));
      setEditingId(null);
      setSuccess(`تم تحديث صلاحيات ${admin.email} ✅`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذر تحديث الصلاحيات");
    } finally {
      setLoading(false);
    }
  }

  async function changeActive(admin: PlatformAdminSummary) {
    setError(""); setSuccess(""); setLoading(true);
    try {
      await updatePlatformAdmin({ data: { authUserId: admin.authUserId, isActive: !admin.isActive } });
      setAdmins((current) => current.map((a) => a.authUserId === admin.authUserId ? { ...a, isActive: !a.isActive } : a));
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذر تعديل حالة الحساب");
    } finally {
      setLoading(false);
    }
  }

  async function remove(admin: PlatformAdminSummary) {
    if (!window.confirm(`هل أنت متأكد من حذف حساب المدير ${admin.email} نهائيًا؟`)) return;
    setError(""); setLoading(true);
    try {
      await deletePlatformAdmin({ data: { authUserId: admin.authUserId } });
      setAdmins((current) => current.filter((a) => a.authUserId !== admin.authUserId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذر حذف الحساب");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main dir="rtl" className="min-h-screen bg-paper">
      <header className="border-b border-line bg-elevated">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <div><p className="text-[11px] uppercase tracking-[0.2em] text-muted">Central administration</p><h1 className="mt-1 font-display text-xl font-semibold">فريق الإدارة المركزية 🛡️</h1></div>
          <Link to="/admin" className="inline-flex items-center gap-2 text-sm text-teal hover:underline"><ArrowRight className="size-4" /> لوحة التحكم</Link>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        <section className="rounded-2xl bg-ink p-6 text-paper sm:p-8">
          <h2 className="font-display text-2xl font-semibold sm:text-3xl">مديرو المنصة</h2>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-paper/65">أضف مديرين إضافيين وحدد بالضبط ما يستطيع كل واحد فعله — إضافة معامل، إيقافها، حذفها، أو إدارة باقي المديرين.</p>
        </section>

        {success ? <div className="mt-5 flex items-start gap-3 rounded-xl border border-ok/20 bg-ok/5 p-4 text-sm"><CheckCircle2 className="mt-0.5 size-5 shrink-0 text-ok" /><p>{success}</p></div> : null}
        {error ? <div className="mt-5 rounded-xl border border-high/20 bg-high/5 p-4 text-sm text-high">{error}</div> : null}

        <div className="mt-6 grid gap-6 lg:grid-cols-[1.1fr_1fr]">
          <section className="app-card p-5 sm:p-6">
            <h3 className="font-display text-xl font-semibold">المديرون الحاليون</h3>
            <div className="mt-4 space-y-3">
              {admins.map((admin) => {
                const isEditing = editingId === admin.authUserId;
                return (
                  <div key={admin.authUserId} className="rounded-xl border border-line p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-medium">{admin.name || admin.email}</p>
                          {admin.isSuper ? <span className="rounded-full bg-teal/10 px-2 py-0.5 text-[11px] text-teal">مدير عام 👑</span> : null}
                          {!admin.isSuper ? <span className={`rounded-full px-2 py-0.5 text-[11px] ${admin.isActive ? "bg-ok/10 text-ok" : "bg-high/10 text-high"}`}>{admin.isActive ? "نشط" : "موقوف"}</span> : null}
                        </div>
                        <p className="mt-1 text-xs text-muted" dir="ltr">{admin.email}</p>
                      </div>
                      {!admin.isSuper ? (
                        <div className="flex flex-wrap gap-2">
                          <Button size="sm" variant="secondary" onClick={() => isEditing ? setEditingId(null) : startEditing(admin)}>
                            {isEditing ? <><ChevronUp />إغلاق</> : <><ChevronDown />الصلاحيات</>}
                          </Button>
                          <Button size="sm" variant={admin.isActive ? "danger" : "secondary"} disabled={loading} onClick={() => changeActive(admin)}><UserX />{admin.isActive ? "إيقاف" : "تفعيل"}</Button>
                          <Button size="sm" variant="danger" disabled={loading} onClick={() => remove(admin)}><Trash2 />حذف</Button>
                        </div>
                      ) : null}
                    </div>

                    {isEditing ? (
                      <div className="mt-4 border-t border-line pt-4">
                        <PermissionChecklist permissions={editingPermissions} onToggle={(p) => toggle(p, editingPermissions, setEditingPermissions)} />
                        <div className="mt-3 flex gap-2">
                          <Button size="sm" disabled={loading} onClick={() => saveEditing(admin)}><Check />حفظ</Button>
                          <Button size="sm" variant="secondary" onClick={() => setEditingId(null)}>إلغاء</Button>
                        </div>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </section>

          <section className="app-card p-5 sm:p-6">
            <div className="mb-6 flex items-center gap-3"><div className="grid size-10 place-items-center rounded-lg bg-teal/10 text-teal"><UserPlus className="size-5" /></div><div><h3 className="font-display text-xl font-semibold">إضافة مدير</h3><p className="text-sm text-muted">حساب دخول مستقل ببريده وكلمة مروره.</p></div></div>
            <form onSubmit={submit} className="space-y-4">
              <div className="space-y-1.5"><Label>الاسم</Label><Input value={name} onChange={(e) => setName(e.target.value)} required placeholder="سارة أحمد" /></div>
              <div className="space-y-1.5"><Label>البريد الإلكتروني</Label><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required dir="ltr" placeholder="name@example.com" /></div>
              <div className="space-y-1.5"><Label>كلمة المرور</Label><Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} dir="ltr" placeholder="8 أحرف على الأقل" /></div>
              <PermissionChecklist permissions={permissions} onToggle={(p) => toggle(p, permissions, setPermissions)} />
              <Button type="submit" size="lg" disabled={loading} className="w-full"><ShieldCheck />{loading ? "جارٍ الإنشاء…" : "إنشاء حساب المدير"}</Button>
            </form>
          </section>
        </div>
      </div>
    </main>
  );
}

function PermissionChecklist({ permissions, onToggle }: { permissions: PlatformPermissions; onToggle: (permission: PlatformPermission) => void }) {
  return (
    <div className="rounded-xl border border-line bg-paper p-4">
      <p className="mb-3 text-sm font-medium">صلاحيات هذا المدير</p>
      <div className="grid gap-2 sm:grid-cols-2">
        {ALL_PLATFORM_PERMISSIONS.map((permission) => (
          <label key={permission} className="flex cursor-pointer items-start gap-3 rounded-lg border border-line/70 p-3 hover:bg-elevated">
            <input type="checkbox" className="mt-0.5 size-4 accent-teal" checked={permissions[permission] === true} onChange={() => onToggle(permission)} />
            <span className="text-sm">{PLATFORM_PERMISSION_LABELS[permission]}</span>
          </label>
        ))}
      </div>
    </div>
  );
}
