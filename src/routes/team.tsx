import { useEffect, useState, type FormEvent } from "react";
import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { ArrowRight, Building2, Check, CheckCircle2, ChevronDown, ChevronUp, ShieldCheck, UserPlus, UserX, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getCurrentLab, type LabProfileData } from "@/lib/lab-access";
import {
  createLabStaff, getCurrentLabPermissions, listLabStaff, updateLabStaff,
  ROLE_LABELS, ASSIGNABLE_ROLES,
  type LabPermission, type LabPermissions, type LabRole, type LabStaff,
} from "@/lib/lab-users";
import { createBranch, listBranches, setUserBranch, updateBranch, type Branch } from "@/lib/branches";
import { PASSWORD_HINT, PASSWORD_MIN_LENGTH } from "@/lib/password-policy";

export const Route = createFileRoute("/team")({
  loader: async () => {
    try {
      const [lab, access] = await Promise.all([getCurrentLab(), getCurrentLabPermissions()]);
      const canManage = access.role === "owner" || access.permissions["users.manage"] === true;
      const staff = canManage ? await listLabStaff() : [];
      const branches = access.role === "owner" ? (await listBranches().catch(() => null))?.branches ?? [] : [];
      return { lab, access, staff, branches };
    } catch {
      return {
        lab: null as LabProfileData | null,
        access: { labId: null, labUserId: null, role: null as LabRole | null, permissions: {} as LabPermissions },
        staff: [] as LabStaff[],
        branches: [] as Branch[],
      };
    }
  },
  component: TeamPage,
});

const permissionLabels: Record<LabPermission, string> = {
  "patients.view": "مشاهدة المرضى",
  "patients.create": "إضافة مريض",
  "patients.edit": "تعديل بيانات المريض",
  "patients.delete": "حذف مريض",
  "reports.view": "مشاهدة التقارير",
  "reports.create": "إنشاء تقرير",
  "reports.edit": "تعديل التقرير",
  "reports.approve": "اعتماد التقارير",
  "reports.delete": "حذف التقرير",
  "reports.print": "طباعة التقارير",
  "reports.export": "تصدير التقارير",
  "users.manage": "إدارة مستخدمي المعمل",
};

const patientPermissions: LabPermission[] = ["patients.view", "patients.create", "patients.edit", "patients.delete"];
const reportPermissions: LabPermission[] = ["reports.view", "reports.create", "reports.edit", "reports.approve", "reports.delete", "reports.print", "reports.export"];

const DEFAULT_NEW_PERMISSIONS: LabPermissions = {
  "patients.view": true, "patients.create": true, "reports.view": true, "reports.create": true, "reports.print": true,
};

function TeamPage() {
  const { lab, access, staff: initialStaff, branches: initialBranches } = Route.useLoaderData();
  const [branches, setBranches] = useState<Branch[]>(initialBranches);
  const isOwner = access.role === "owner";
  const [staff, setStaff] = useState<LabStaff[]>(initialStaff);
  const [username, setUsername] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Exclude<LabRole, "owner">>("supervisor");
  const [permissions, setPermissions] = useState<LabPermissions>(DEFAULT_NEW_PERMISSIONS);
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingPermissions, setEditingPermissions] = useState<LabPermissions>({});
  const [editingRole, setEditingRole] = useState<Exclude<LabRole, "owner">>("supervisor");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => setStaff(initialStaff), [initialStaff]);

  if (!lab) return <Navigate to="/login" replace />;
  const canManageUsers = access.role === "owner" || access.permissions["users.manage"] === true;
  if (!canManageUsers) return <Navigate to="/lab" replace />;

  function togglePermission(permission: LabPermission, current: LabPermissions, setter: (v: LabPermissions) => void) {
    setter({ ...current, [permission]: current[permission] !== true });
  }
  function setPermissionGroup(group: LabPermission[], enabled: boolean, current: LabPermissions, setter: (v: LabPermissions) => void) {
    const next = { ...current };
    for (const permission of group) next[permission] = enabled;
    setter(next);
  }
  function countEnabled(values: LabPermissions) {
    return Object.values(values).filter((v) => v === true).length;
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(""); setSuccess(""); setLoading(true);
    try {
      const created = await createLabStaff({ data: { username, name, password, role, permissions } });
      setStaff((current) => [...current, {
        id: created.id, username: created.username, name: created.name, role: created.role,
        permissions: created.permissions, isActive: true, createdAt: new Date().toISOString(), branchId: null,
      }]);
      setUsername(""); setName(""); setPassword(""); setRole("supervisor"); setPermissions(DEFAULT_NEW_PERMISSIONS);
      setSuccess(`تم إنشاء حساب ${created.username} بنجاح ✅`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذر إنشاء الحساب");
    } finally {
      setLoading(false);
    }
  }

  function startEditing(member: LabStaff) {
    setError(""); setSuccess("");
    setEditingId(member.id);
    setEditingRole(member.role === "owner" ? "supervisor" : member.role);
    setEditingPermissions({ ...member.permissions });
  }
  function cancelEditing() {
    setEditingId(null); setEditingPermissions({});
  }

  async function saveEditing(member: LabStaff) {
    setError(""); setSuccess(""); setLoading(true);
    try {
      await updateLabStaff({ data: { id: member.id, role: editingRole, permissions: editingPermissions } });
      setStaff((current) => current.map((item) => item.id === member.id ? { ...item, role: editingRole, permissions: editingPermissions } : item));
      setEditingId(null); setEditingPermissions({});
      setSuccess(`تم تحديث صلاحيات ${member.username} بنجاح ✅`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذر تحديث الصلاحيات");
    } finally {
      setLoading(false);
    }
  }

  async function changeActive(member: LabStaff) {
    setError(""); setSuccess(""); setLoading(true);
    try {
      await updateLabStaff({ data: { id: member.id, isActive: !member.isActive } });
      setStaff((current) => current.map((item) => item.id === member.id ? { ...item, isActive: !item.isActive } : item));
      setSuccess(member.isActive ? `تم إيقاف ${member.username}` : `تم تفعيل ${member.username} ✅`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذر تعديل حالة الحساب");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main dir="rtl" className="min-h-screen bg-paper">
      <header className="border-b border-line bg-elevated">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <div><p className="text-[11px] uppercase tracking-[0.2em] text-muted">Laboratory Team</p><h1 className="mt-1 font-display text-xl font-semibold">مستخدمو المعمل 👥</h1></div>
          <Link to="/lab" className="inline-flex items-center gap-2 text-sm text-teal hover:underline"><ArrowRight className="size-4" /> لوحة المعمل</Link>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        <section className="rounded-2xl bg-ink p-6 text-paper sm:p-8">
          <div className="flex items-start gap-4">
            <div className="grid size-12 shrink-0 place-items-center rounded-2xl bg-teal/20"><ShieldCheck className="size-6 text-paper" /></div>
            <div>
              <p className="text-sm text-paper/60">{lab.lab_name}</p>
              <h2 className="mt-2 font-display text-2xl font-semibold sm:text-3xl">إدارة فريق المعمل</h2>
              <p className="mt-3 max-w-2xl text-sm leading-7 text-paper/65">أنشئ حسابًا مستقلًا لكل مستخدم، وحدد بالضبط ما يستطيع فعله داخل المعمل.</p>
            </div>
          </div>
        </section>

        {success ? <div className="mt-5 flex items-start gap-3 rounded-xl border border-ok/20 bg-ok/5 p-4 text-sm"><CheckCircle2 className="mt-0.5 size-5 shrink-0 text-ok" /><p>{success}</p></div> : null}
        {error ? <div className="mt-5 rounded-xl border border-high/20 bg-high/5 p-4 text-sm text-high">{error}</div> : null}

        {isOwner ? <BranchesPanel branches={branches} setBranches={setBranches} onError={setError} /> : null}

        <div className="mt-6 grid gap-6 lg:grid-cols-[1.1fr_1fr]">
          <section className="rounded-xl border border-line bg-elevated p-5 sm:p-6">
            <div className="flex items-center gap-3"><div className="grid size-10 place-items-center rounded-lg bg-teal/10 text-teal"><Users className="size-5" /></div><div><h3 className="font-display text-xl font-semibold">الفريق الحالي</h3><p className="text-sm text-muted">{staff.length} حساب داخل المعمل</p></div></div>

            <div className="mt-5 space-y-3">
              {staff.length === 0 ? <div className="rounded-xl border border-dashed border-line p-6 text-center text-sm text-muted">لا يوجد مستخدمون إضافيون حتى الآن.</div> : null}

              {staff.map((member) => {
                const isEditing = editingId === member.id;
                return (
                  <div key={member.id} className="rounded-xl border border-line p-4">
                    <div className="flex flex-col gap-3">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-medium">{member.name || member.username}</p>
                            <span className="rounded-full bg-teal/10 px-2 py-0.5 text-[11px] text-teal">{ROLE_LABELS[member.role]}</span>
                            <span className={`rounded-full px-2 py-0.5 text-[11px] ${member.isActive ? "bg-ok/10 text-ok" : "bg-high/10 text-high"}`}>{member.isActive ? "نشط" : "موقوف"}</span>
                            {member.role !== "owner" && member.branchId ? <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] text-amber-700">{branches.find((b) => b.id === member.branchId)?.name ?? "فرع"}</span> : null}
                          </div>
                          <p className="mt-1 text-xs text-muted" dir="ltr">{member.username}</p>
                        </div>

                        {member.role !== "owner" ? (
                          <div className="flex flex-wrap gap-2">
                            <Button size="sm" variant="secondary" onClick={() => isEditing ? cancelEditing() : startEditing(member)}>
                              {isEditing ? <><ChevronUp />إغلاق</> : <><ChevronDown />تعديل الصلاحيات</>}
                            </Button>
                            <Button size="sm" variant={member.isActive ? "danger" : "secondary"} disabled={loading} onClick={() => changeActive(member)}>
                              <UserX />{member.isActive ? "إيقاف" : "تفعيل"}
                            </Button>
                          </div>
                        ) : null}
                      </div>

                      {isOwner && member.role !== "owner" && branches.length > 0 ? (
                        <MemberBranchSelect
                          member={member}
                          branches={branches}
                          onChanged={(branchId) => setStaff((cur) => cur.map((m) => (m.id === member.id ? { ...m, branchId } : m)))}
                          onError={setError}
                        />
                      ) : null}

                      {member.role !== "owner" ? (
                        <div className="rounded-lg bg-paper p-3">
                          <p className="text-xs text-muted">الصلاحيات الحالية</p>
                          <p className="mt-1 text-sm font-medium">{countEnabled(member.permissions)} صلاحية مفعلة</p>
                        </div>
                      ) : (
                        <div className="rounded-lg bg-teal/5 p-3 text-sm text-teal">👑 مالك المعمل لديه جميع الصلاحيات تلقائيًا.</div>
                      )}

                      {isEditing ? (
                        <div className="border-t border-line pt-4">
                          <div className="space-y-4">
                            <div className="space-y-1.5">
                              <Label>نوع المستخدم</Label>
                              <select className="flex h-11 w-full rounded-sm border border-line bg-elevated px-3 text-sm" value={editingRole} onChange={(e) => setEditingRole(e.target.value as Exclude<LabRole, "owner">)}>
                                {ASSIGNABLE_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                              </select>
                            </div>

                            <PermissionEditor
                              permissions={editingPermissions}
                              onToggle={(permission) => togglePermission(permission, editingPermissions, setEditingPermissions)}
                              onGroupChange={(group, enabled) => setPermissionGroup(group, enabled, editingPermissions, setEditingPermissions)}
                            />

                            <div className="flex flex-wrap gap-2">
                              <Button disabled={loading} onClick={() => saveEditing(member)}><Check />{loading ? "جارٍ الحفظ…" : "حفظ التعديلات"}</Button>
                              <Button variant="secondary" disabled={loading} onClick={cancelEditing}>إلغاء</Button>
                            </div>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="rounded-xl border border-line bg-elevated p-5 sm:p-6">
            <div className="mb-6 flex items-center gap-3"><div className="grid size-10 place-items-center rounded-lg bg-teal/10 text-teal"><UserPlus className="size-5" /></div><div><h3 className="font-display text-xl font-semibold">إضافة مستخدم</h3><p className="text-sm text-muted">كل مستخدم له تسجيل دخول مستقل.</p></div></div>
            <form onSubmit={submit} className="space-y-5">
              <Field label="اسم الموظف" value={name} onChange={setName} placeholder="أحمد محمد" />
              <Field label="اسم المستخدم" value={username} onChange={setUsername} required placeholder="ahmed_lab" dir="ltr" />
              <Field label="كلمة المرور" value={password} onChange={setPassword} required type="password" minLength={PASSWORD_MIN_LENGTH} placeholder={PASSWORD_HINT} dir="ltr" />
              <div className="space-y-1.5">
                <Label htmlFor="role">نوع المستخدم</Label>
                <select id="role" className="flex h-11 w-full rounded-sm border border-line bg-elevated px-3 text-sm" value={role} onChange={(e) => setRole(e.target.value as Exclude<LabRole, "owner">)}>
                  {ASSIGNABLE_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                </select>
              </div>

              <PermissionEditor
                permissions={permissions}
                onToggle={(permission) => togglePermission(permission, permissions, setPermissions)}
                onGroupChange={(group, enabled) => setPermissionGroup(group, enabled, permissions, setPermissions)}
              />

              <Button type="submit" size="lg" disabled={loading} className="w-full"><UserPlus />{loading ? "جارٍ إنشاء الحساب…" : "إنشاء حساب المستخدم"}</Button>
            </form>
          </section>
        </div>
      </div>
    </main>
  );
}

function PermissionEditor({ permissions, onToggle, onGroupChange }: {
  permissions: LabPermissions;
  onToggle: (permission: LabPermission) => void;
  onGroupChange: (group: LabPermission[], enabled: boolean) => void;
}) {
  return (
    <div className="space-y-4 rounded-xl border border-line bg-paper p-4">
      <div><h4 className="font-medium">صلاحيات المستخدم 🔐</h4><p className="mt-1 text-xs text-muted">حدد العمليات التي يسمح له بتنفيذها.</p></div>
      <PermissionGroup title="المرضى 👥" permissions={patientPermissions} values={permissions} onToggle={onToggle} onGroupChange={onGroupChange} />
      <PermissionGroup title="التقارير 🧾" permissions={reportPermissions} values={permissions} onToggle={onToggle} onGroupChange={onGroupChange} />
      <div className="rounded-lg border border-line bg-elevated p-3">
        <label className="flex cursor-pointer items-start gap-3">
          <input type="checkbox" className="mt-0.5 size-4 accent-teal" checked={permissions["users.manage"] === true} onChange={() => onToggle("users.manage")} />
          <span><span className="block text-sm font-medium">إدارة مستخدمي المعمل</span><span className="mt-0.5 block text-xs text-muted">إضافة وتعديل وإيقاف مستخدمي نفس المعمل.</span></span>
        </label>
      </div>
    </div>
  );
}

function PermissionGroup({ title, permissions, values, onToggle, onGroupChange }: {
  title: string; permissions: LabPermission[]; values: LabPermissions;
  onToggle: (permission: LabPermission) => void; onGroupChange: (group: LabPermission[], enabled: boolean) => void;
}) {
  const allEnabled = permissions.every((p) => values[p] === true);
  return (
    <div className="rounded-lg border border-line bg-elevated p-3">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h5 className="text-sm font-semibold">{title}</h5>
        <button type="button" className="text-xs text-teal hover:underline" onClick={() => onGroupChange(permissions, !allEnabled)}>{allEnabled ? "إلغاء الكل" : "تحديد الكل"}</button>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {permissions.map((permission) => (
          <label key={permission} className="flex cursor-pointer items-start gap-3 rounded-lg border border-line/70 p-3 transition hover:bg-paper">
            <input type="checkbox" className="mt-0.5 size-4 accent-teal" checked={values[permission] === true} onChange={() => onToggle(permission)} />
            <span className="text-sm">{permissionLabels[permission]}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

function Field({ label, value, onChange, required, placeholder, dir, type = "text", minLength }: {
  label: string; value: string; onChange: (value: string) => void; required?: boolean; placeholder?: string; dir?: "ltr" | "rtl"; type?: string; minLength?: number;
}) {
  return <div className="space-y-1.5"><Label>{label}</Label><Input type={type} value={value} onChange={(e) => onChange(e.target.value)} required={required} minLength={minLength} placeholder={placeholder} dir={dir} /></div>;
}

function MemberBranchSelect({ member, branches, onChanged, onError }: { member: LabStaff; branches: Branch[]; onChanged: (branchId: string | null) => void; onError: (message: string) => void }) {
  const [busy, setBusy] = useState(false);
  async function change(value: string) {
    onError("");
    setBusy(true);
    try {
      await setUserBranch({ data: { labUserId: member.id, branchId: value || null } });
      onChanged(value || null);
    } catch (err) {
      onError(err instanceof Error ? err.message : "تعذر تغيير الفرع");
    } finally {
      setBusy(false);
    }
  }
  // A deactivated branch can stay selected for someone already on it, but can't be picked for others.
  const options = branches.filter((b) => b.isActive || b.id === member.branchId);
  return (
    <div className="rounded-lg bg-paper p-3">
      <Label>الفرع</Label>
      <select
        className="mt-1.5 flex h-11 w-full rounded-sm border border-line bg-elevated px-3 text-sm"
        value={member.branchId ?? ""}
        disabled={busy}
        onChange={(e) => change(e.target.value)}
      >
        <option value="">كل الفروع</option>
        {options.map((b) => <option key={b.id} value={b.id}>{b.name}{b.isActive ? "" : " (موقوف)"}</option>)}
      </select>
      <p className="mt-1 text-[11px] leading-5 text-muted">لو اخترت فرع، المستخدم هيشوف تقارير الفرع ده بس. «كل الفروع» = يشوف كل التقارير.</p>
    </div>
  );
}

function BranchesPanel({ branches, setBranches, onError }: { branches: Branch[]; setBranches: (fn: (cur: Branch[]) => Branch[]) => void; onError: (message: string) => void }) {
  const [name, setName] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  async function add(e: FormEvent) {
    e.preventDefault();
    onError("");
    setBusyId("new");
    try {
      const created = await createBranch({ data: { name } });
      setBranches((cur) => [...cur, created]);
      setName("");
    } catch (err) {
      onError(err instanceof Error ? err.message : "تعذر إضافة الفرع");
    } finally {
      setBusyId(null);
    }
  }

  async function patch(id: string, data: { name?: string; isActive?: boolean }) {
    onError("");
    setBusyId(id);
    try {
      const updated = await updateBranch({ data: { id, ...data } });
      setBranches((cur) => cur.map((b) => (b.id === id ? updated : b)));
      setRenamingId(null);
    } catch (err) {
      onError(err instanceof Error ? err.message : "تعذر تعديل الفرع");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="mt-6 rounded-xl border border-line bg-elevated p-5 sm:p-6">
      <div className="flex items-center gap-3">
        <div className="grid size-10 place-items-center rounded-lg bg-teal/10 text-teal"><Building2 className="size-5" /></div>
        <div>
          <h3 className="font-display text-xl font-semibold">فروع المعمل</h3>
          <p className="text-sm text-muted">{branches.length ? `${branches.length} فرع` : "مفيش فروع. المعمل شغال كوحدة واحدة."} أنت (المالك) بتشوف كل الفروع مع بعض.</p>
        </div>
      </div>

      {branches.length ? (
        <ul className="mt-4 divide-y divide-line rounded-xl border border-line">
          {branches.map((b) => (
            <li key={b.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
              {renamingId === b.id ? (
                <form className="flex flex-1 gap-2" onSubmit={(e) => { e.preventDefault(); void patch(b.id, { name: renameValue }); }}>
                  <Input value={renameValue} onChange={(e) => setRenameValue(e.target.value)} aria-label="اسم الفرع" />
                  <Button type="submit" size="sm" disabled={busyId === b.id}>حفظ</Button>
                  <Button type="button" size="sm" variant="outline" onClick={() => setRenamingId(null)}>إلغاء</Button>
                </form>
              ) : (
                <>
                  <p className="text-sm font-medium">{b.name} <span className={`ms-2 rounded-full px-2 py-0.5 text-[11px] ${b.isActive ? "bg-ok/10 text-ok" : "bg-high/10 text-high"}`}>{b.isActive ? "نشط" : "موقوف"}</span></p>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" disabled={busyId === b.id} onClick={() => { setRenamingId(b.id); setRenameValue(b.name); }}>تغيير الاسم</Button>
                    <Button size="sm" variant={b.isActive ? "secondary" : "primary"} disabled={busyId === b.id} onClick={() => patch(b.id, { isActive: !b.isActive })}>{b.isActive ? "إيقاف" : "تفعيل"}</Button>
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      ) : null}

      <form onSubmit={add} className="mt-4 flex flex-col gap-2 sm:flex-row">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="اسم الفرع، مثل: فرع المعادي" maxLength={60} required aria-label="اسم فرع جديد" />
        <Button type="submit" disabled={busyId === "new"}>{busyId === "new" ? "جارٍ الإضافة…" : "إضافة فرع"}</Button>
      </form>
      <p className="mt-2 text-[11px] leading-5 text-muted">الفرع بيتوقف ومبيتمسحش، عشان تقاريره تفضل محفوظة. الفرع الموقوف مايقبلش تقارير جديدة.</p>
    </section>
  );
}
