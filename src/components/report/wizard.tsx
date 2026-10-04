import { useNavigate } from "@tanstack/react-router";
import { Check, ChevronLeft, ChevronRight, Loader2, Search, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { getNormalDefault, getQualitativeOptions } from "@/lib/qualitative-options";
import { resolveRange } from "@/lib/range-resolution";
import { normalizeNumerals } from "@/lib/numerals";
import { isValidPhone } from "@/lib/phone";
import { AGE_UNITS, ageProblem, ageToYears, formatAge, parseAgeUnit } from "@/lib/age";
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
import { listBranches, type Branch } from "@/lib/branches";
import type { LabCatalogRow } from "@/lib/lab-catalog";
import { searchLabPatients, type PatientSummary } from "@/lib/patients";
import { isOffline, newRequestId, queueReport } from "@/lib/offline/sync";
import { EDIT_BLOCKED, queueReportEdit } from "@/lib/sync-engine/outbox-actions";

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

export function ReportWizard({ catalog, editReport, labId }: { catalog: LabCatalogRow[]; editReport?: { id: string; draft: Draft }; labId?: string }) {
  const draft = useLabStore((s) => s.draft);
  const setDraft = useLabStore((s) => s.setDraft);
  const resetDraft = useLabStore((s) => s.resetDraft);
  const save = useLabStore((s) => s.saveDraftAsReport);
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [saving, setSaving] = useState(false);
  const submitting = useRef(false);
  // Owner only: which branch a new report belongs to (staff always use their own branch).
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchId, setBranchId] = useState("");
  useEffect(() => {
    if (editReport) return;
    let cancelled = false;
    listBranches()
      .then((r) => { if (!cancelled && r.isOwner) setBranches(r.branches.filter((b) => b.isActive)); })
      .catch(() => { /* offline: the report is saved without a branch choice */ });
    return () => { cancelled = true; };
  }, [editReport?.id]);

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

  /** Why this step cannot be left yet, in words the user can act on; null = fine. */
  function stepBlock(s: number): string | null {
    if (s === 0) {
      if (draft.patientName.trim().length < 2) return "اكتب اسم المريض";
      const ageIssue = ageProblem(Number(draft.age), parseAgeUnit(draft.ageUnit));
      if (ageIssue) return ageIssue;
      if (!isValidPhone(draft.phone)) return "اكتب رقم هاتف صحيح (10 أرقام على الأقل)";
      if (draft.gender !== "ذكر" && draft.gender !== "أنثى") return "اختر النوع";
    }
    if (s === 1 && draft.tests.length === 0) return "اختر تحليلًا واحدًا على الأقل";
    if (s === 2 && !draft.tests.some((t) => t.value.trim())) return "أدخل نتيجة واحدة على الأقل";
    return null;
  }

  const blockReason = stepBlock(step);
  const canNext = () => blockReason === null;

  /** Step-bar taps: going back is free; going forward needs the steps in between to be complete. */
  function goStep(target: number) {
    if (target <= step) return go(target);
    for (let s = step; s < target; s += 1) {
      const why = stepBlock(s);
      if (why) {
        go(s);
        toast.error(why);
        return;
      }
    }
    go(target);
  }

  // Every step starts at the top; otherwise the next step opens scrolled to the bottom on a phone.
  useEffect(() => {
    if (typeof window !== "undefined") window.scrollTo({ top: 0 });
  }, [step]);

  function toggleCategory(id: string) {
    const on = draft.selectedCategoryIds.includes(id);
    const selectedCategoryIds = on
      ? draft.selectedCategoryIds.filter((x) => x !== id)
      : [...draft.selectedCategoryIds, id];
    const tests = on ? draft.tests.filter((t) => t.categoryId !== id) : draft.tests;
    setDraft({ selectedCategoryIds, tests });
  }

  /** A ready-made pack selects its categories AND all their tests (undo from the toast). */
  function applyPack(ids: string[]) {
    const before = { selectedCategoryIds: draft.selectedCategoryIds, tests: draft.tests };
    const selectedCategoryIds = Array.from(new Set([...draft.selectedCategoryIds, ...ids]));
    const have = new Set(draft.tests.map((t) => `${t.categoryId}:${t.name}`));
    const added = catalogCategories
      .filter((c) => ids.includes(c.id))
      .flatMap((c) =>
        c.tests
          .filter((t) => !have.has(`${c.id}:${t.name}`))
          .map((def) => ({ name: def.name, categoryId: c.id, categoryAr: c.nameAr, categoryEn: c.nameEn, value: "", unit: def.unit })),
      );
    setDraft({ selectedCategoryIds, tests: [...draft.tests, ...added] });
    if (added.length) {
      toast.success(`تمت إضافة ${added.length} تحليل`, { action: { label: "تراجع", onClick: () => setDraft(before) } });
    }
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

  /** Fill every EMPTY urine/stool pick-list with its normal value; undo from the toast. */
  function fillNormals() {
    const before = draft.tests;
    let filled = 0;
    const tests = before.map((t) => {
      if (t.value.trim()) return t;
      const preset = getNormalDefault(t.categoryId, t.name);
      if (!preset) return t;
      filled += 1;
      return { ...t, value: preset };
    });
    if (!filled) return;
    setDraft({ tests });
    toast.success(`تمت تعبئة ${filled} خانة بالقيم الطبيعية — راجعها على الفحص الفعلي`, {
      action: { label: "تراجع", onClick: () => setDraft({ tests: before }) },
    });
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
    if (submitting.current) return; // a second tap while saving must not create a second report
    const age = Number(draft.age);
    const entered = draft.tests.filter((t) => t.value.trim());
    if (!draft.patientName.trim() || !age || !draft.gender || !entered.length) {
      toast.error("أكمل بيانات المريض وأدخل نتيجة واحدة على الأقل.");
      return;
    }
    const payload = {
      patientName: draft.patientName, patientCode: draft.patientCode, age, ageUnit: parseAgeUnit(draft.ageUnit), gender: draft.gender,
      phone: draft.phone, doctor: draft.doctor, notes: draft.notes,
      collectedAt: draft.collectedAt, tests: draft.tests,
    };
    // One id per save attempt: if the request reaches the server but the answer
    // is lost, the queued retry carries the same id and the server ignores it.
    const requestId = newRequestId();
    const enteredAt = new Date().toISOString();
    submitting.current = true;
    setSaving(true);
    try {
      const report = editReport
        ? await updateLabReport({ data: { ...payload, id: editReport.id } })
        : await createLabReport({ data: { ...payload, branchId: branchId || undefined, clientRequestId: requestId, clientCreatedAt: enteredAt, expectedLabId: labId } });
      resetDraft();
      toast.success(editReport ? "تم تحديث المسودة" : "تم حفظ التقرير في قاعدة بيانات المعمل");
      void navigate({ to: "/reports/$id", params: { id: report.id } });
    } catch (error) {
      if (!editReport && labId && isOffline(error)) {
        try {
          await queueReport({ requestId, labId, payload, createdAt: enteredAt });
          resetDraft();
          toast.success("لا يوجد اتصال — تم حفظ التقرير على الجهاز وسيُرسل تلقائيًا عند عودة الاتصال.");
          return;
        } catch {
          toast.error("تعذر الحفظ على الجهاز. لا تغلق الصفحة، وأعد المحاولة عند عودة الاتصال.");
          return;
        }
      }
      if (editReport && isOffline(error)) {
        // Save the edit on this device; it is sent (and checked against newer changes) when the connection is back.
        if (!labId) {
          toast.error("تعديل المسودة يحتاج اتصالًا بالإنترنت.");
          return;
        }
        try {
          await queueReportEdit({ labId, reportId: editReport.id, payload });
          resetDraft();
          toast.success("لا يوجد اتصال — اتحفظ التعديل على الجهاز وهيتبعت تلقائيًا لما الاتصال يرجع.");
          void navigate({ to: "/reports/$id", params: { id: editReport.id } });
        } catch (queueError) {
          const m = queueError instanceof Error ? queueError.message : "";
          toast.error(
            m === EDIT_BLOCKED
              ? "فيه تعديل سابق لسه محتاج مراجعة. اتصل بالنت وراجعه الأول."
              : m === "NO_LOCAL_COPY_OF_REPORT"
                ? "مفيش نسخة محفوظة على الجهاز من التقرير ده. تعديله محتاج اتصال."
                : "تعذر حفظ التعديل على الجهاز. لا تغلق الصفحة، وأعد المحاولة.",
          );
        }
        return;
      }
      toast.error(error instanceof Error ? error.message : "تعذر حفظ التقرير");
    } finally {
      submitting.current = false;
      setSaving(false);
    }
  }

  const gender = (draft.gender || "ذكر") as Gender;

  /** "Clear draft" is one tap away from losing everything typed, so it can be undone. */
  function clearDraft() {
    const snapshot = draft;
    resetDraft();
    toast("تم مسح المسودة", { action: { label: "تراجع", onClick: () => setDraft(snapshot) } });
  }

  // The range the saved report will use: the lab's age band, else the lab's
  // male/female range. Keeps the live flags identical to the saved report.
  const catalogIndex = useMemo(() => new Map(catalog.map((r) => [`${r.category_id}:${r.test_name}`, r])), [catalog]);
  const ageNumber = ageToYears(Number(draft.age), parseAgeUnit(draft.ageUnit)) ?? Number.NaN;
  const rangeFor = (t: { name: string; categoryId: string }): string | undefined =>
    resolveRange(catalogIndex.get(`${t.categoryId}:${t.name}`), t, gender, ageNumber);
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
              onClick={() => goStep(i)}
              aria-current={i === step ? "step" : undefined}
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

      {step === 0 && <PatientStep draft={draft} setDraft={setDraft} branches={editReport ? [] : branches} branchId={branchId} setBranchId={setBranchId} />}
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
          catalogIndex={catalogIndex}
          rangeFor={rangeFor}
          fillNormals={fillNormals}
          setValue={setValue}
          setCustomRange={setCustomRange}
          remove={(name, categoryId) =>
            setDraft({
              tests: draft.tests.filter((t) => !(t.name === name && t.categoryId === categoryId)),
            })
          }
        />
      )}
      {step === 3 && <ReviewStep draft={draft} gender={gender} rangeFor={rangeFor} />}

      <div className="sticky bottom-[calc(4rem+env(safe-area-inset-bottom))] z-30 -mx-4 mt-8 border-t border-line bg-paper/95 px-4 py-3 backdrop-blur-sm sm:-mx-6 sm:px-6 lg:bottom-0 lg:mx-0 lg:px-0">
      {blockReason ? <p role="status" className="mb-2 text-xs text-muted">{blockReason}</p> : null}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button variant="ghost" onClick={() => (step === 0 ? clearDraft() : go(step - 1))} disabled={saving}>
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
          <Button onClick={finish} disabled={!canNext() || saving}>
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
            {saving ? "جارٍ الحفظ…" : editReport ? "حفظ التعديلات" : "حفظ وإصدار التقرير"}
          </Button>
        )}
      </div>
      </div>
    </div>
  );
}

function PatientStep({
  draft,
  setDraft,
  branches,
  branchId,
  setBranchId,
}: {
  draft: Draft;
  setDraft: (p: Partial<Draft>) => void;
  branches: Branch[];
  branchId: string;
  setBranchId: (id: string) => void;
}) {
  const [patientQuery, setPatientQuery] = useState("");
  const [patients, setPatients] = useState<PatientSummary[]>([]);
  const [searching, setSearching] = useState(false);

  async function findPatients() {
    if (patientQuery.trim().length < 2) return;
    setSearching(true);
    try {
      setPatients(await searchLabPatients({ data: { query: patientQuery } }));
    } catch (error) {
      toast.error(isOffline(error) ? "البحث عن المرضى يحتاج اتصالًا — اكتب بيانات المريض يدويًا." : "تعذر البحث عن المرضى");
    } finally {
      setSearching(false);
    }
  }

  function usePatient(patient: PatientSummary) {
    setDraft({
      patientName: patient.fullName,
      patientCode: patient.patientCode,
      age: String(patient.age || ""),
      ageUnit: parseAgeUnit(patient.ageUnit),
      gender: patient.gender,
      phone: patient.phone || "",
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
            <p className="mt-1 text-xs text-muted">ابحث بالاسم أو كود المريض أو الهاتف.</p>
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
          <div className="flex gap-2">
            <Input
              id="age"
              inputMode="numeric"
              value={draft.age}
              onChange={(e) => setDraft({ age: normalizeNumerals(e.target.value).replace(/[^\d]/g, "").slice(0, 3) })}
              placeholder={draft.ageUnit === "months" ? "بالشهور" : draft.ageUnit === "days" ? "بالأيام" : "بالسنوات"}
            />
            <NativeSelect
              aria-label="وحدة السن"
              value={parseAgeUnit(draft.ageUnit)}
              onChange={(e) => setDraft({ ageUnit: parseAgeUnit(e.target.value) })}
              className="w-24 shrink-0"
            >
              {AGE_UNITS.map((u) => (
                <option key={u.value} value={u.value}>
                  {u.label}
                </option>
              ))}
            </NativeSelect>
          </div>
        </div>
        <div>
          <Label htmlFor="phone">رقم الهاتف (مطلوب)</Label>
          <Input
            id="phone"
            value={draft.phone}
            onChange={(e) => setDraft({ phone: normalizeNumerals(e.target.value) })}
            placeholder="01xxxxxxxxx"
            inputMode="tel"
            autoComplete="tel"
            required
            aria-invalid={draft.phone.trim() !== "" && !isValidPhone(draft.phone)}
            dir="ltr"
          />
          {draft.phone.trim() !== "" && !isValidPhone(draft.phone) ? (
            <p className="mt-1 text-xs text-high">اكتب رقمًا صحيحًا من 10 أرقام على الأقل.</p>
          ) : (
            <p className="mt-1 text-xs text-muted">يُستخدم لإرسال التقرير للمريض على واتساب.</p>
          )}
        </div>
        <div>
          <Label>النوع</Label>
          <div className="grid grid-cols-2 gap-2">
            {(["ذكر", "أنثى"] as const).map((g) => (
              <button
                key={g}
                type="button"
                onClick={() => setDraft({ gender: g })}
                aria-pressed={draft.gender === g}
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
          <Label htmlFor="doc">الطبيب المعالج</Label>
          <Input
            id="doc"
            value={draft.doctor}
            onChange={(e) => setDraft({ doctor: e.target.value })}
            placeholder="Himself أو اسم الطبيب"
          />
        </div>
        {branches.length > 0 ? (
          <div>
            <Label htmlFor="branch">الفرع</Label>
            <select
              id="branch"
              value={branchId}
              onChange={(e) => setBranchId(e.target.value)}
              className="flex h-11 w-full rounded-sm border border-line bg-elevated px-3 text-sm"
            >
              <option value="">بدون فرع</option>
              {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>
        ) : null}
        <div>
          <Label htmlFor="collectedAt">تاريخ سحب العينة</Label>
          <Input
            id="collectedAt"
            type="date"
            value={draft.collectedAt}
            onChange={(e) => setDraft({ collectedAt: e.target.value })}
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

const CUSTOM = "__custom__";

/**
 * Enter in a result field jumps to the next result field (DOM order), so a full
 * panel can be typed without touching the screen between tests. On the last
 * field it just closes the keyboard. Shift+Enter and IME composition are left
 * alone.
 */
function focusNextResultOnEnter(e: ReactKeyboardEvent<HTMLElement>) {
  if (e.key !== "Enter" || e.shiftKey || e.nativeEvent.isComposing) return;
  const target = e.target as HTMLElement;
  if (!target.matches("[data-result-field]")) return;
  e.preventDefault();
  const fields: HTMLElement[] = Array.from(e.currentTarget.querySelectorAll<HTMLElement>("[data-result-field]"));
  const next = fields[fields.indexOf(target) + 1];
  if (next) {
    next.focus();
    if (next instanceof HTMLInputElement) next.select();
  } else {
    target.blur();
  }
}

/**
 * Result entry. Urine / stool tests get a pick-list (with "other" for anything
 * unusual, and for old values that are not in the list); everything else stays
 * a plain input.
 */
function ResultField({
  test,
  onChange,
}: {
  test: { name: string; categoryId: string; value: string };
  onChange: (value: string) => void;
}) {
  const options = getQualitativeOptions(test.categoryId, test.name);
  const [custom, setCustom] = useState(false);

  if (!options) {
    return (
      <Input
        value={test.value}
        onChange={(e) => onChange(normalizeNumerals(e.target.value))}
        placeholder="قيمة"
        className="tabular-nums"
        inputMode="text"
        data-result-field
        enterKeyHint="next"
      />
    );
  }

  const listed = options.some((o) => o.value === test.value);
  const showText = custom || (test.value !== "" && !listed);

  return (
    <div className="space-y-2">
      <NativeSelect
        data-result-field
        value={showText ? CUSTOM : test.value}
        aria-label={`نتيجة ${test.name}`}
        onChange={(e) => {
          const v = e.target.value;
          if (v === CUSTOM) {
            setCustom(true);
            if (listed) onChange("");
            return;
          }
          setCustom(false);
          onChange(v);
        }}
      >
        <option value="">اختر…</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.value}
          </option>
        ))}
        <option value={CUSTOM}>أخرى (اكتب)…</option>
      </NativeSelect>
      {showText ? (
        <Input
          value={test.value}
          onChange={(e) => onChange(normalizeNumerals(e.target.value))}
          placeholder="اكتب النتيجة"
          autoFocus={custom && test.value === ""}
          data-result-field
          enterKeyHint="next"
        />
      ) : null}
    </div>
  );
}

function ResultsStep({
  draft,
  gender,
  catalogIndex,
  rangeFor,
  fillNormals,
  setValue,
  setCustomRange,
  remove,
}: {
  draft: Draft;
  gender: Gender;
  catalogIndex: Map<string, LabCatalogRow>;
  rangeFor: (t: { name: string; categoryId: string }) => string | undefined;
  fillNormals: () => void;
  setValue: (name: string, categoryId: string, value: string) => void;
  setCustomRange: (name: string, categoryId: string, range: string) => void;
  remove: (name: string, categoryId: string) => void;
}) {
  if (draft.tests.length === 0) {
    return <p className="text-sm text-muted">لا توجد تحاليل مختارة.</p>;
  }
  const ageNumberOrUndefined = ageToYears(Number(draft.age) || undefined, parseAgeUnit(draft.ageUnit));
  const fillable = draft.tests.filter((t) => !t.value.trim() && getNormalDefault(t.categoryId, t.name)).length;
  const filledCount = draft.tests.filter((t) => t.value.trim()).length;
  const emptyCount = draft.tests.length - filledCount;

  function jumpToFirstEmpty() {
    const el = document.querySelector<HTMLElement>('[data-results-list] li[data-empty="true"] [data-result-field]');
    if (!el) return;
    el.scrollIntoView({ block: "center", behavior: "smooth" });
    el.focus({ preventScroll: true });
  }

  return (
    <div className="overflow-hidden rounded-lg border border-line bg-elevated">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-paper px-4 py-3">
        <p className="text-sm font-medium" aria-live="polite">
          تم إدخال {filledCount} من {draft.tests.length}
        </p>
        <div className="flex flex-wrap gap-2">
          {emptyCount > 0 && filledCount > 0 ? (
            <Button type="button" size="sm" variant="ghost" onClick={jumpToFirstEmpty}>أول خانة فاضية</Button>
          ) : null}
          {fillable > 0 ? (
            <Button type="button" size="sm" variant="secondary" onClick={fillNormals}>كله طبيعي ({fillable})</Button>
          ) : null}
        </div>
      </div>
      {fillable > 0 ? (
        <p className="border-b border-line px-4 py-2 text-xs leading-5 text-muted">
          "كله طبيعي" بيملأ خانات البول والبراز الفاضية بالقيم الطبيعية. عدّل اللي مختلف بس، وراجعها على الفحص الفعلي.
        </p>
      ) : null}
      <ul data-results-list className="divide-y divide-line" onKeyDown={focusNextResultOnEnter}>
        {draft.tests.map((t) => {
          const effective = t.customRange || rangeFor(t);
          const range = effective || getNormalRange(t.name, gender, ageNumberOrUndefined, t.categoryId);
          const interp = t.value ? interpretResult(t.name, t.value, gender, effective, ageNumberOrUndefined, t.categoryId) : null;
          return (
            <li key={`${t.categoryId}-${t.name}`} data-empty={!t.value.trim()} className="grid gap-3 p-4 sm:grid-cols-[1fr_11rem_8rem_auto] sm:items-end">
              <div>
                <p className="text-sm font-medium">{t.name}</p>
                <p className="text-[11px] text-muted">
                  {t.categoryAr} · {t.unit || "بدون وحدة"} · المرجع: {range}
                </p>
                {(() => {
                  // "How is this test done?" — the method the lab copied from the kit pamphlet.
                  const row = catalogIndex.get(`${t.categoryId}:${t.name}`);
                  if (!row) return null;
                  const method = row.method_info?.trim();
                  return (
                    <details className="mt-1 text-xs">
                      <summary className="cursor-pointer select-none text-teal hover:underline">كيف يتم التحليل؟</summary>
                      {method ? (
                        <p className="mt-1 whitespace-pre-wrap rounded-sm bg-paper-2/60 p-2 leading-5">{method}</p>
                      ) : (
                        <p className="mt-1 leading-5 text-muted">لسه محدش سجّل طريقة العمل لهذا التحليل. تتضاف من صفحة كتالوج التحاليل (من بامفلت الكيت).</p>
                      )}
                    </details>
                  );
                })()}
              </div>
              <div>
                <Label>النتيجة</Label>
                <ResultField test={t} onChange={(v) => setValue(t.name, t.categoryId, v)} />
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

function ReviewStep({ draft, gender, rangeFor }: { draft: Draft; gender: Gender; rangeFor: (t: { name: string; categoryId: string }) => string | undefined }) {
  const ageNumberOrUndefined = ageToYears(Number(draft.age) || undefined, parseAgeUnit(draft.ageUnit));
  const filled = draft.tests.filter((t) => t.value.trim());
  const flags = filled.map((t) => interpretResult(t.name, t.value, gender, t.customRange || rangeFor(t), ageNumberOrUndefined, t.categoryId));
  const abnormal = flags.filter((f) => f.flag === "high" || f.flag === "low" || f.flag === "abnormal").length;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="المريض" value={draft.patientName || "—"} />
        <Stat label="كود المريض" value={draft.patientCode || "سيتم إنشاؤه تلقائيًا"} />
        <Stat label="الهاتف" value={draft.phone || "—"} />
        <Stat label="السن / النوع" value={`${draft.age ? formatAge("ar", Number(draft.age), draft.ageUnit) : "—"} / ${draft.gender || "—"}`} />
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
              const interp = interpretResult(t.name, t.value, gender, t.customRange || rangeFor(t), ageNumberOrUndefined, t.categoryId);
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
