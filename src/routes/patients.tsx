import { createFileRoute, Link } from "@tanstack/react-router";
import { isValidPhone, phoneDigits } from "@/lib/phone";
import { Plus, Search, UserRound, X } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/layout/app-shell";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  createPatient,
  getPatientReports,
  searchLabPatients,
  type PatientSummary,
} from "@/lib/patients";
import { getCurrentLabPermissions } from "@/lib/lab-users";
import { formatArDate } from "@/lib/utils";
import { AGE_UNITS, formatAge, parseAgeUnit, type AgeUnit } from "@/lib/age";
import { normalizeNumerals } from "@/lib/numerals";
import { loadLocalPatientReports, loadLocalPatientSearch } from "@/lib/sync-engine/offline-fallback";
import { requestAllOfflinePages } from "@/lib/offline/sync";
import { useOnline } from "@/lib/offline/use-offline";

export const Route = createFileRoute("/patients")({
  loader: async () => {
    try {
      const access = await getCurrentLabPermissions();
      return { canCreate: access.permissions["patients.create"] === true };
    } catch {
      return { canCreate: false };
    }
  },
  component: PatientsPage,
});

type PatientReport = Awaited<ReturnType<typeof getPatientReports>>[number];

function PatientsPage() {
  const { canCreate } = Route.useLoaderData();
  const [q, setQ] = useState("");
  const [patients, setPatients] = useState<PatientSummary[]>([]);
  const [selected, setSelected] = useState<PatientSummary | null>(null);
  const [history, setHistory] = useState<PatientReport[]>([]);
  const [loading, setLoading] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const online = useOnline();
  // true = the list on screen came from the copy saved on this device, not from the server
  const [fromDevice, setFromDevice] = useState(false);

  useEffect(() => {
    if (navigator.onLine) requestAllOfflinePages();
  }, []);

  async function search() {
    if (q.trim().length < 2) return;

    setLoading(true);

    try {
      const result = await searchLabPatients({
        data: { query: q },
      });

      setPatients(result);
      setSelected(null);
      setHistory([]);
      setFromDevice(false);
    } catch (error) {
      // No connection: search the copy saved on this device (read-only).
      const local = await loadLocalPatientSearch(error, q);
      if (local) {
        setPatients(local);
        setSelected(null);
        setHistory([]);
        setFromDevice(true);
      } else {
        toast.error("تعذر البحث عن المرضى");
      }
    } finally {
      setLoading(false);
    }
  }

  async function selectPatient(patient: PatientSummary) {
    setSelected(patient);
    setHistoryLoading(true);

    try {
      setHistory(
        await getPatientReports({
          data: { patientId: patient.id },
        }),
      );
    } catch (error) {
      const local = await loadLocalPatientReports(error, patient.id);
      if (local) setHistory(local);
      else toast.error("تعذر تحميل سجل التقارير");
    } finally {
      setHistoryLoading(false);
    }
  }

  return (
    <AppShell>
      <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-muted">
            قاعدة المرضى
          </p>

          <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight">
            المرضى
          </h1>

          <p className="mt-2 text-sm text-muted">
            ملف موحد لكل مريض، مع سجل تقاريره داخل المعمل.
          </p>

          {!online || fromDevice ? (
            <p className="mt-2 text-xs text-ink-soft">
              شغّال بدون إنترنت: البحث بيتم من النسخة المحفوظة على الجهاز، وإضافة مريض جديد محتاجة اتصال.
            </p>
          ) : null}
        </div>

        {canCreate ? (
          <Button onClick={() => setShowForm(true)} disabled={!online} title={online ? undefined : "إضافة مريض محتاجة اتصال بالإنترنت"}>
            <Plus className="size-4" />
            مريض جديد
          </Button>
        ) : null}
      </header>

      <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <section>
          <div className="rounded-xl border border-line bg-elevated p-4">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute top-3.5 start-3 size-4 text-muted" />

                <Input
                  className="ps-9"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void search();
                  }}
                  placeholder="الاسم أو الكود أو الهاتف"
                />
              </div>

              <Button
                onClick={() => void search()}
                disabled={loading || q.trim().length < 2}
              >
                {loading ? "بحث…" : "بحث"}
              </Button>
            </div>

            <p className="mt-2 text-xs text-muted">
              اكتب حرفين على الأقل للبحث.
            </p>
          </div>

          <div className="mt-4 overflow-hidden rounded-xl border border-line bg-elevated">
            {patients.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => void selectPatient(p)}
                className={`flex w-full items-center gap-3 border-b border-line px-4 py-4 text-start last:border-b-0 hover:bg-paper-2/50 ${
                  selected?.id === p.id ? "bg-teal/5" : ""
                }`}
              >
                <div className="grid size-10 shrink-0 place-items-center rounded-full bg-teal/10 text-teal">
                  <UserRound className="size-5" />
                </div>

                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">
                    {p.fullName}
                  </p>

                  <p className="text-xs text-muted">
                    {p.patientCode || "بدون كود"} ·{" "}
                    {p.age ? formatAge("ar", p.age, p.ageUnit) : "-"} · {p.gender}
                  </p>

                  <p className="text-xs text-muted">
                    {p.phone || "لا يوجد هاتف"} ·{" "}
                    {p.reportCount} تقرير
                  </p>
                </div>

                <span className="shrink-0 text-xs text-teal">
                  فتح الملف
                </span>
              </button>
            ))}

            {!patients.length ? (
              <p className="px-4 py-14 text-center text-sm text-muted">
                ابحث عن مريض أو أضف مريضًا جديدًا للبدء.
              </p>
            ) : null}
          </div>
        </section>

        <aside className="h-fit rounded-xl border border-line bg-elevated p-5">
          {!selected ? (
            <div className="py-8 text-center">
              <div className="mx-auto grid size-12 place-items-center rounded-full bg-teal/10 text-teal">
                <UserRound className="size-6" />
              </div>

              <h2 className="mt-4 font-display text-xl font-semibold">
                ملف المريض
              </h2>

              <p className="mt-2 text-sm leading-6 text-muted">
                اختر مريضًا من النتائج لعرض بياناته وسجل التقارير السابقة.
              </p>
            </div>
          ) : (
            <>
              <div className="flex items-start gap-3">
                <div className="grid size-11 shrink-0 place-items-center rounded-full bg-teal/10 text-teal">
                  <UserRound className="size-5" />
                </div>

                <div className="min-w-0 flex-1">
                  <h2 className="truncate font-display text-xl font-semibold">
                    {selected.fullName}
                  </h2>

                  <p className="mt-1 text-xs text-muted">
                    {selected.patientCode || "بدون كود"} ·{" "}
                    {selected.gender} · {formatAge("ar", selected.age, selected.ageUnit)}
                  </p>
                </div>
              </div>

              <div className="mt-4 grid gap-2 text-sm">
                <Info
                  label="الهاتف"
                  value={selected.phone || "غير مسجل"}
                />

              </div>

              <Link
                to="/new"
                className="mt-5 flex h-10 items-center justify-center rounded-md bg-teal px-4 text-sm font-medium text-teal-fg hover:opacity-90"
              >
                إنشاء تقرير جديد
              </Link>

              <div className="mt-6 border-t border-line pt-5">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold">
                    سجل التقارير
                  </h3>

                  <span className="text-xs text-muted">
                    {history.length}
                  </span>
                </div>

                {historyLoading ? (
                  <p className="mt-4 text-sm text-muted">
                    جاري تحميل السجل…
                  </p>
                ) : history.length ? (
                  <div className="mt-3 space-y-2">
                    {history.map((r) => (
                      <Link
                        key={r.id}
                        to="/reports/$id"
                        params={{ id: r.id }}
                        className="block rounded-lg border border-line p-3 hover:border-teal/40"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-medium">
                            {r.sample_id || "Report"}
                          </span>

                          <Status status={r.status} />
                        </div>

                        <p className="mt-1 text-xs text-muted">
                          {formatArDate(String(r.created_at))}
                        </p>
                      </Link>
                    ))}
                  </div>
                ) : (
                  <p className="mt-4 text-sm text-muted">
                    لا توجد تقارير سابقة لهذا المريض.
                  </p>
                )}
              </div>
            </>
          )}
        </aside>
      </div>

      {showForm ? (
        <NewPatientModal
          onClose={() => setShowForm(false)}
          onCreated={(patient) => {
            setShowForm(false);
            setPatients((current) => [patient, ...current]);
            void selectPatient(patient);
            toast.success("تم إنشاء ملف المريض");
          }}
        />
      ) : null}
    </AppShell>
  );
}

function Info({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="flex justify-between gap-4 rounded-lg bg-paper-2/50 px-3 py-2">
      <span className="text-muted">{label}</span>

      <span dir="ltr" className="text-end">
        {value}
      </span>
    </div>
  );
}

function Status({ status }: { status: string }) {
  const label =
    status === "approved"
      ? "معتمد"
      : status === "pending_review"
        ? "مراجعة"
        : status === "cancelled"
          ? "ملغي"
          : "مسودة";

  return (
    <span className="rounded-full bg-paper-2 px-2 py-0.5 text-[11px] text-muted">
      {label}
    </span>
  );
}

function NewPatientModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (patient: PatientSummary) => void;
}) {
  const [form, setForm] = useState({
    fullName: "",
    patientCode: "",
    age: "",
    ageUnit: "years" as AgeUnit,
    gender: "ذكر" as "ذكر" | "أنثى",
    phone: "",
    notes: "",
  });

  const [saving, setSaving] = useState(false);

  const set = <K extends keyof typeof form>(
    key: K,
    value: (typeof form)[K],
  ) => {
    setForm((f) => ({
      ...f,
      [key]: value,
    }));
  };

  async function submit(e: FormEvent) {
    e.preventDefault();

    if (!isValidPhone(form.phone)) {
      toast.error("اكتب رقم هاتف صحيح (10 أرقام على الأقل)");
      return;
    }

    setSaving(true);

    try {
      const patient = await createPatient({
        data: {
          ...form,
          age: Number(form.age),
          ageUnit: form.ageUnit,
        },
      });

      onCreated({
        id: patient.id,
        patientCode: patient.patientCode,
        fullName: patient.fullName,
        age: patient.age,
        ageUnit: patient.ageUnit,
        gender: patient.gender,
        phone: phoneDigits(form.phone),
        reportCount: 0,
      });
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "تعذر إنشاء المريض",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/30 p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-xl rounded-2xl border border-line bg-elevated p-5 shadow-xl sm:p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-display text-xl font-semibold">
              إضافة مريض جديد
            </h2>

            <p className="mt-1 text-sm text-muted">
              سيتم إنشاء ملف مستقل للمريض داخل المعمل الحالي.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="إغلاق"
            className="rounded-md p-2 hover:bg-paper-2"
          >
            <X className="size-5" />
          </button>
        </div>

        <form
          onSubmit={submit}
          className="mt-5 grid gap-4 sm:grid-cols-2"
        >
          <div className="sm:col-span-2">
            <Label>اسم المريض</Label>

            <Input
              required
              value={form.fullName}
              onChange={(e) =>
                set("fullName", e.target.value)
              }
              placeholder="مثال: أحمد محمد علي"
            />
          </div>

          <div>
            <Label>كود المريض</Label>

            <Input
              value={form.patientCode}
              onChange={(e) =>
                set(
                  "patientCode",
                  e.target.value.toUpperCase(),
                )
              }
              placeholder="P-001"
              dir="ltr"
            />
          </div>

          <div>
            <Label>السن</Label>

            <div className="flex gap-2">
              <Input
                required
                value={form.age}
                onChange={(e) =>
                  set(
                    "age",
                    normalizeNumerals(e.target.value).replace(/\D/g, "").slice(0, 3),
                  )
                }
                inputMode="numeric"
                placeholder="35"
                aria-label="السن"
              />

              <select
                value={form.ageUnit}
                onChange={(e) => set("ageUnit", parseAgeUnit(e.target.value))}
                aria-label="وحدة السن"
                className="h-10 shrink-0 rounded-md border border-line bg-paper px-2 text-sm"
              >
                {AGE_UNITS.map((u) => (
                  <option key={u.value} value={u.value}>
                    {u.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <Label>النوع</Label>

            <select
              value={form.gender}
              onChange={(e) =>
                set(
                  "gender",
                  e.target.value as "ذكر" | "أنثى",
                )
              }
              className="h-10 w-full rounded-md border border-line bg-paper px-3 text-sm"
            >
              <option value="ذكر">ذكر</option>
              <option value="أنثى">أنثى</option>
            </select>
          </div>

          <div>
            <Label>الهاتف (مطلوب)</Label>

            <Input
              value={form.phone}
              onChange={(e) =>
                set("phone", e.target.value)
              }
              inputMode="tel"
              required
              autoComplete="tel"
              dir="ltr"
              placeholder="01xxxxxxxxx"
            />
          </div>

          <div className="sm:col-span-2">
            <Label>ملاحظات</Label>

            <Input
              value={form.notes}
              onChange={(e) =>
                set("notes", e.target.value)
              }
              placeholder="ملاحظات اختيارية"
            />
          </div>

          <div className="sm:col-span-2 flex justify-end gap-2 border-t border-line pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
            >
              إلغاء
            </Button>

            <Button type="submit" disabled={saving}>
              {saving ? "جاري الحفظ…" : "حفظ المريض"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
