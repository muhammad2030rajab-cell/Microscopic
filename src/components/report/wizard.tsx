import { useNavigate } from "@tanstack/react-router";
import { Check, ChevronLeft, ChevronRight, Search, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FlagBadge } from "@/components/report/flag-badge";
import { interpretResult } from "@/lib/medical";
import { useLabStore, type Draft } from "@/lib/store";
import {
  CATEGORIES,
  getNormalRange,
  type Category,
  type Gender,
} from "@/lib/tests-catalog";
import { cn } from "@/lib/utils";
import { createLabReport, updateLabReport } from "@/lib/lab-reports";
import type { LabCatalogRow } from "@/lib/lab-catalog";
import { searchLabPatients, type PatientSummary } from "@/lib/patients";

const STEPS = ["المريض", "التحاليل", "النتائج", "المراجعة"];

const PACKS: { label: string; ids: string[] }[] = [
  { label: "صورة دم", ids: ["c3"] },
  { label: "كبد", ids: ["c1"] },
  { label: "كلى", ids: ["c2"] },
  { label: "دهون", ids: ["c4"] },
  { label: "سكر", ids: ["c5"] },
  { label: "غدة درقية", ids: ["c7"] },
  { label: "فيتامينات", ids: ["c8"] },
  { label: "كشف شامل", ids: ["c1", "c2", "c3", "c4", "c5"] },
];

export function ReportWizard({ catalog, editReport }: { catalog: LabCatalogRow[]; editReport?: { id: string; draft: Draft } }) {
  const draft = useLabStore((s) => s.draft);
  const setDraft = useLabStore((s) => s.setDraft);
  const resetDraft = useLabStore((s) => s.resetDraft);
  const save = useLabStore((s) => s.saveDraftAsReport);
  const navigate = useNavigate();
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (editReport) setDraft({ ...editReport.draft });
  }, [editReport?.id]);

  const step = draft.step;
  const catalogCategories = useMemo(() => {
    const byCategory = new Map<string, { id: string; nameAr: string; nameEn: string; tests: { name: string; unit: string; male: string; female: string }[] }>();
    for (const item of catalog.filter((x) => x.is_active)) {
      const category = byCategory.get(item.category_id) ?? {
        id: item.category_id,
        nameAr: item.category_name_ar,
        nameEn: item.category_name_en,
        tests: [],
      };
      category.tests.push({ name: item.test_name, unit: item.unit, male: item.male_range, female: item.female_range });
      byCategory.set(item.category_id, category);
    }
    return Array.from(byCategory.values());
  }, [catalog]);
  const selectedCats = useMemo(
    () => catalogCategories.filter((c) => draft.selectedCategoryIds.includes(c.id)),
    [catalogCategories, draft.selectedCategoryIds],
  );

  function go(next: number) {
    setDraft({ step: Math.max(0, Math.min(STEPS.length - 1, next)) });
  }

  function canNext() {
    if (step === 0) {
      return (
        draft.patientName.trim().length > 1 &&
        Number(draft.age) > 0 &&
        (draft.gender === "ذكر" || draft.gender === "أنثى")
      );
    }
    if (step === 1) return draft.tests.length > 0;
    if (step === 2) return draft.tests.some((t) => t.value.trim());
    return true;
  }

  function toggleCategory(id: string) {
    const on = draft.selectedCategoryIds.includes(id);
    const selectedCategoryIds = on
      ? draft.selectedCategoryIds.filter((x) => x !== id)
      : [...draft.selectedCategoryIds, id];
    const tests = on ? draft.tests.filter((t) => t.categoryId !== id) : draft.tests;
    setDraft({ selectedCategoryIds, tests });
  }

  function applyPack(ids: string[]) {
    const selectedCategoryIds = Array.from(new Set([...draft.selectedCategoryIds, ...ids]));
    setDraft({ selectedCategoryIds });
  }

  function toggleTest(category: Category, name: string) {
    const exists = draft.tests.find((t) => t.name === name && t.categoryId === category.id);
    if (exists) {
      setDraft({
        tests: draft.tests.filter((t) => !(t.name === name && t.categoryId === category.id)),
      });
      return;
    }
    const def = category.tests.find((t) => t.name === name);
    if (!def) return;
    setDraft({
      tests: [
        ...draft.tests,
        {
          name: def.name,
          categoryId: category.id,
          categoryAr: category.nameAr,
          categoryEn: category.nameEn,
          value: "",
          unit: def.unit,
        },
      ],
    });
  }

  function selectAllInCategory(category: Category) {
    const existing = new Set(
      draft.tests.filter((t) => t.categoryId === category.id).map((t) => t.name),
    );
    const added = category.tests
      .filter((t) => !existing.has(t.name))
      .map((def) => ({
        name: def.name,
        categoryId: category.id,
        categoryAr: category.nameAr,
        categoryEn: category.nameEn,
        value: "",
        unit: def.unit,
      }));
    setDraft({ tests: [...draft.tests, ...added] });
  }

  function setValue(name: string, categoryId: string, value: string) {
    setDraft({
      tests: draft.tests.map((t) =>
        t.name === name && t.categoryId === categoryId ? { ...t, value } : t,
      ),
    });
  }

  function setCustomRange(name: string, categoryId: string, customRange: string) {
    setDraft({
      tests: draft.tests.map((t) =>
        t.name === name && t.categoryId === categoryId ? { ...t, customRange } : t,
      ),
    });
  }

  async function finish() {
    const age = Number(draft.age);
    const entered = draft.tests.filter((t) => t.value.trim());
    if (!draft.patientName.trim() || !age || !draft.gender || !entered.length) {
      toast.error("أكمل بيانات المريض وأدخل نتيجة واحدة على الأقل.");
      return;
    }
    try {
      const payload = {
        patientName: draft.patientName, patientCode: draft.patientCode, age, gender: draft.gender,
        phone: draft.phone, nationalId: draft.nationalId, doctor: draft.doctor, notes: draft.notes, tests: draft.tests,
      };
      const report = editReport
        ? await updateLabReport({ data: { ...payload, id: editReport.id } })
        : await createLabReport({ data: payload });
      resetDraft();
      toast.success(editReport ? "تم تحديث المسودة" : "تم حفظ التقرير في قاعدة بيانات المعمل");
      void navigate({ to: "/reports/$id", params: { id: report.id } });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر حفظ التقرير");
    }
  }

  const gender = (draft.gender || "ذكر") as Gender;
  const filteredCats = query.trim()
    ? selectedCats
        .map((c) => ({
          ...c,
          tests: c.tests.filter((t) => t.name.toLowerCase().includes(query.toLowerCase())),
        }))
        .filter((c) => c.tests.length > 0)
    : selectedCats;

  return (
    <div className="mx-auto max-w-3xl">
      <header className="mb-6">
        <p className="text-xs uppercase tracking-[0.18em] text-muted">{editReport ? "تعديل المسودة" : "تقرير جديد"}</p>
        <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight">{editReport ? "تعديل تقرير معملي" : "إنشاء تقرير معملي"}</h1>
      </header>

      <ol className="mb-8 grid grid-cols-4 gap-2">
        {STEPS.map((label, i) => (
          <li key={label}>
            <button
              type="button"
              onClick={() => go(i)}
              className={cn(
                "flex h-12 w-full flex-col items-center justify-center rounded-md border text-xs transition-colors duration-150 sm:text-sm",
                i === step
                  ? "border-ink bg-ink text-paper"
                  : i < step
                    ? "border-teal bg-ok-bg text-teal"
                    : "border-line bg-elevated text-muted",
              )}
            >
              <span className="hidden sm:inline">{label}</span>
              <span className="sm:hidden">{i + 1}</span>
            </button>
          </li>
        ))}
      </ol>

      {step === 0 && <PatientStep draft={draft} setDraft={setDraft} />}
      {step === 1 && (
        <TestsStep
          draft={draft}
          query={query}
          setQuery={setQuery}
          toggleCategory={toggleCategory}
          applyPack={applyPack}
          toggleTest={toggleTest}
          selectAllInCategory={selectAllInCategory}
          categories={catalogCategories}
          filteredCats={query ? filteredCats : selectedCats}
        />
      )}
      {step === 2 && (
        <ResultsStep
          draft={draft}
          gender={gender}
          setValue={setValue}
          setCustomRange={setCustomRange}
          remove={(name, categoryId) =>
            setDraft({
              tests: draft.tests.filter((t) => !(t.name === name && t.categoryId === categoryId)),
            })
          }
        />
      )}
      {step === 3 && <ReviewStep draft={draft} gender={gender} />}

      <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-5">
        <Button variant="ghost" onClick={() => (step === 0 ? resetDraft() : go(step - 1))}>
          {step === 0 ? (
            "مسح المسودة"
          ) : (
            <>
              <ChevronRight className="size-4" />
              السابق
            </>
          )}
        </Button>
        {step < 3 ? (
          <Button onClick={() => go(step + 1)} disabled={!canNext()}>
            التالي
            <ChevronLeft className="size-4" />
          </Button>
        ) : (
          <Button onClick={finish} disabled={!canNext()}>
            <Check className="size-4" />
            {editReport ? "حفظ التعديلات" : "حفظ وإصدار التقرير"}
          </Button>
        )}
      </div>
    </div>
  );
}

function PatientStep({
  draft,
  setDraft,
}: {
  draft: Draft;
  setDraft: (p: Partial<Draft>) => void;
}) {
  const [patientQuery, setPatientQuery] = useState("");
  const [patients, setPatients] = useState<PatientSummary[]>([]);
  const [searching, setSearching] = useState(false);

  async function findPatients() {
    if (patientQuery.trim().length < 2) return;
    setSearching(true);
    try {
      setPatients(await searchLabPatients({ data: { query: patientQuery } }));
    } catch {
      toast.error("تعذر البحث عن المرضى");
    } finally {
      setSearching(false);
    }
  }

  function usePatient(patient: PatientSummary) {
    setDraft({
      patientName: patient.fullName,
      patientCode: patient.patientCode,
      age: String(patient.age || ""),
      gender: patient.gender,
      phone: patient.phone || "",
      nationalId: patient.nationalId || "",
    });
    setPatients([]);
    setPatientQuery("");
    toast.success("تم تحميل بيانات المريض");
  }

  return (
    <div className="rounded-lg border border-line bg-elevated p-5 sm:p-7">
      <div className="mb-5 rounded-xl border border-line bg-paper p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="font-medium">مريض سابق؟ 🔎</p>
            <p className="mt-1 text-xs text-muted">ابحث بالاسم أو كود المريض أو الهاتف أو الرقم القومي.</p>
          </div>
        </div>
        <div className="mt-3 flex gap-2">
          <Input value={patientQuery} onChange={(e) => setPatientQuery(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void findPatients(); }} placeholder="مثال: أحمد حسن أو P-2026" />
          <Button type="button" variant="secondary" onClick={() => void findPatients()} disabled={searching || patientQuery.trim().length < 2}>
            {searching ? "بحث…" : "بحث"}
          </Button>
        </div>
        {patients.length > 0 ? (
          <div className="mt-3 divide-y divide-line overflow-hidden rounded-lg border border-line bg-elevated">
            {patients.map((patient) => (
              <button key={patient.id} type="button" onClick={() => usePatient(patient)} className="flex w-full items-center justify-between gap-3 px-3 py-3 text-start hover:bg-paper-2/50">
                <span className="min-w-0"><span className="block truncate font-medium">{patient.fullName}</span><span className="text-xs text-muted">{patient.patientCode || "بدون كود"} · {patient.age || "-"} سنة · {patient.reportCount} تقرير سابق</span></span>
                <span className="shrink-0 text-xs text-teal">استخدام</span>
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Label htmlFor="pname">اسم المريض</Label>
          <Input
            id="pname"
            value={draft.patientName}
            onChange={(e) => setDraft({ patientName: e.target.value })}
            placeholder="مثال: أحمد حسن عبد الله"
            autoComplete="name"
          />
        </div>
        <div>
          <Label htmlFor="pcode">كود المريض (اختياري)</Label>
          <Input
            id="pcode"
            value={draft.patientCode}
            onChange={(e) => setDraft({ patientCode: e.target.value.toUpperCase() })}
            placeholder="مثال: P-20260914-001"
            dir="ltr"
          />
        </div>
        <div>
          <Label htmlFor="age">السن</Label>
          <Input
            id="age"
            inputMode="numeric"
            value={draft.age}
            onChange={(e) => setDraft({ age: e.target.value.replace(/[^\d]/g, "") })}
            placeholder="بالسنوات"
          />
        </div>
        <div>
          <Label htmlFor="phone">رقم الهاتف (اختياري)</Label>
          <Input
            id="phone"
            value={draft.phone}
            onChange={(e) => setDraft({ phone: e.target.value })}
            placeholder="01xxxxxxxxx"
            inputMode="tel"
            dir="ltr"
          />
        </div>
        <div>
          <Label>النوع</Label>
          <div className="grid grid-cols-2 gap-2">
            {(["ذكر", "أنثى"] as const).map((g) => (
              <button
                key={g}
                type="button"
                onClick={() => setDraft({ gender: g })}
                className={cn(
                  "h-11 rounded-sm border text-sm transition-colors duration-150",
                  draft.gender === g
                    ? "border-ink bg-ink text-paper"
                    : "border-line bg-surface text-ink-soft hover:border-line-strong",
                )}
              >
                {g}
              </button>
            ))}
          </div>
        </div>
        <div>
          <Label htmlFor="nid">الرقم القومي (اختياري)</Label>
          <Input
            id="nid"
            value={draft.nationalId}
            onChange={(e) => setDraft({ nationalId: e.target.value.replace(/[^\d]/g, "").slice(0, 14) })}
            placeholder="14 رقم"
            inputMode="numeric"
            dir="ltr"
          />
        </div>
        <div className="sm:col-span-2">
          <Label htmlFor="doc">الطبيب المعالج</Label>
          <Input
            id="doc"
            value={draft.doctor}
            onChange={(e) => setDraft({ doctor: e.target.value })}
            placeholder="Himself أو اسم الطبيب"
          />
        </div>
        <div className="sm:col-span-2">
          <Label htmlFor="notes">ملاحظات (اختياري)</Label>
          <Textarea
            id="notes"
            value={draft.notes}
            onChange={(e) => setDraft({ notes: e.target.value })}
            placeholder="سبب التحليل أو ملاحظات فنية"
          />
        </div>
      </div>
    </div>
  );
}

function TestsStep({
  draft,
  query,
  setQuery,
  toggleCategory,
  applyPack,
  toggleTest,
  selectAllInCategory,
  categories,
  filteredCats,
}: {
  draft: Draft;
  query: string;
  setQuery: (v: string) => void;
  toggleCategory: (id: string) => void;
  applyPack: (ids: string[]) => void;
  toggleTest: (c: Category, name: string) => void;
  selectAllInCategory: (c: Category) => void;
  categories: Category[];
  filteredCats: Category[];
}) {
  return (
    <div className="space-y-5">
      <div>
        <p className="mb-2 text-xs font-medium text-ink-soft">باقات جاهزة</p>
        <div className="flex flex-wrap gap-2">
          {PACKS.map((p) => (
            <button
              key={p.label}
              type="button"
              onClick={() => applyPack(p.ids)}
              className="h-9 rounded-full border border-line bg-elevated px-3 text-xs text-ink-soft transition-colors hover:border-teal hover:text-teal"
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="mb-2 text-xs font-medium text-ink-soft">الأقسام</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {categories.map((c) => {
            const on = draft.selectedCategoryIds.includes(c.id);
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => toggleCategory(c.id)}
                className={cn(
                  "flex min-h-14 flex-col items-start rounded-md border px-3 py-2 text-start transition-colors duration-150",
                  on ? "border-ink bg-ink text-paper" : "border-line bg-elevated hover:border-line-strong",
                )}
              >
                <span className="text-sm font-medium">{c.nameAr}</span>
                <span className={cn("text-[11px]", on ? "text-paper/70" : "text-muted")}>
                  {c.nameEn} · {c.tests.length}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {draft.selectedCategoryIds.length > 0 && (
        <div className="relative">
          <Search className="pointer-events-none absolute top-3.5 start-3 size-4 text-muted" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="بحث داخل الأقسام المختارة"
            className="ps-9"
          />
        </div>
      )}

      {filteredCats.map((c) => (
        <section key={c.id} className="rounded-lg border border-line bg-elevated p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h3 className="font-medium">
              {c.nameAr}{" "}
              <span className="text-xs font-normal text-muted">{c.nameEn}</span>
            </h3>
            <button
              type="button"
              onClick={() => selectAllInCategory(c)}
              className="text-xs text-teal hover:underline"
            >
              اختيار الكل
            </button>
          </div>
          <ul className="grid gap-1 sm:grid-cols-2">
            {c.tests.map((t) => {
              const on = draft.tests.some((x) => x.name === t.name && x.categoryId === c.id);
              return (
                <li key={t.name}>
                  <button
                    type="button"
                    onClick={() => toggleTest(c, t.name)}
                    className={cn(
                      "flex min-h-11 w-full items-center justify-between gap-2 rounded-sm px-2 text-start text-sm transition-colors",
                      on ? "bg-ok-bg text-ink" : "hover:bg-paper-2",
                    )}
                  >
                    <span>
                      {t.name}
                      {t.unit ? <span className="ms-1 text-[11px] text-muted">{t.unit}</span> : null}
                    </span>
                    <span
                      className={cn(
                        "flex size-5 shrink-0 items-center justify-center rounded-sm border",
                        on ? "border-teal bg-teal text-teal-fg" : "border-line",
                      )}
                    >
                      {on ? <Check className="size-3" /> : null}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      {draft.selectedCategoryIds.length === 0 && (
        <p className="rounded-md border border-dashed border-line px-4 py-8 text-center text-sm text-muted">
          اختر قسماً أو باقة للبدء.
        </p>
      )}
    </div>
  );
}

function ResultsStep({
  draft,
  gender,
  setValue,
  setCustomRange,
  remove,
}: {
  draft: Draft;
  gender: Gender;
  setValue: (name: string, categoryId: string, value: string) => void;
  setCustomRange: (name: string, categoryId: string, range: string) => void;
  remove: (name: string, categoryId: string) => void;
}) {
  if (draft.tests.length === 0) {
    return <p className="text-sm text-muted">لا توجد تحاليل مختارة.</p>;
  }
  return (
    <div className="overflow-hidden rounded-lg border border-line bg-elevated">
      <ul className="divide-y divide-line">
        {draft.tests.map((t) => {
          const range = t.customRange || getNormalRange(t.name, gender);
          const interp = t.value ? interpretResult(t.name, t.value, gender, t.customRange) : null;
          return (
            <li key={`${t.categoryId}-${t.name}`} className="grid gap-3 p-4 sm:grid-cols-[1fr_8rem_8rem_auto] sm:items-end">
              <div>
                <p className="text-sm font-medium">{t.name}</p>
                <p className="text-[11px] text-muted">
                  {t.categoryAr} · {t.unit || "بدون وحدة"} · المرجع: {range}
                </p>
              </div>
              <div>
                <Label>النتيجة</Label>
                <Input
                  value={t.value}
                  onChange={(e) => setValue(t.name, t.categoryId, e.target.value)}
                  placeholder="قيمة"
                  className="tabular-nums"
                />
              </div>
              <div>
                <Label>مدى مخصص</Label>
                <Input
                  value={t.customRange ?? ""}
                  onChange={(e) => setCustomRange(t.name, t.categoryId, e.target.value)}
                  placeholder="اختياري"
                />
              </div>
              <div className="flex items-center gap-2">
                {interp ? <FlagBadge flag={interp.flag} /> : <span className="w-16" />}
                <button
                  type="button"
                  onClick={() => remove(t.name, t.categoryId)}
                  className="flex size-11 items-center justify-center rounded-sm text-muted hover:bg-high-bg hover:text-high"
                  aria-label={`حذف ${t.name}`}
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function ReviewStep({ draft, gender }: { draft: Draft; gender: Gender }) {
  const filled = draft.tests.filter((t) => t.value.trim());
  const flags = filled.map((t) => interpretResult(t.name, t.value, gender, t.customRange));
  const abnormal = flags.filter((f) => f.flag === "high" || f.flag === "low" || f.flag === "abnormal").length;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="المريض" value={draft.patientName || "—"} />
        <Stat label="كود المريض" value={draft.patientCode || "سيتم إنشاؤه تلقائيًا"} />
        <Stat label="الهاتف" value={draft.phone || "—"} />
        <Stat label="الرقم القومي" value={draft.nationalId || "—"} />
        <Stat label="السن / النوع" value={`${draft.age || "—"} / ${draft.gender || "—"}`} />
        <Stat label="تحاليل" value={String(filled.length)} />
        <Stat label="غير طبيعية" value={String(abnormal)} />
      </div>
      <div className="overflow-hidden rounded-lg border border-line bg-elevated">
        <table className="w-full text-sm">
          <thead className="bg-paper-2/60 text-xs text-muted">
            <tr>
              <th className="px-4 py-2 text-start font-medium">التحليل</th>
              <th className="px-4 py-2 text-start font-medium">النتيجة</th>
              <th className="px-4 py-2 text-start font-medium">الحالة</th>
            </tr>
          </thead>
          <tbody>
            {filled.map((t) => {
              const interp = interpretResult(t.name, t.value, gender, t.customRange);
              return (
                <tr key={`${t.categoryId}-${t.name}`} className="border-t border-line">
                  <td className="px-4 py-2.5">{t.name}</td>
                  <td className="px-4 py-2.5 tabular-nums">
                    {t.value} {t.unit}
                  </td>
                  <td className="px-4 py-2.5">
                    <FlagBadge flag={interp.flag} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted">
        عند الحفظ تُضاف القيم المحسوبة تلقائياً مثل LDL و A/G و eGFR إن توفرت مدخلاتها.
      </p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-line bg-elevated px-3 py-3">
      <p className="text-[11px] text-muted">{label}</p>
      <p className="mt-1 truncate text-sm font-medium">{value}</p>
    </div>
  );
}
