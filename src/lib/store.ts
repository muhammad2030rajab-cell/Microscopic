import { useEffect, useState } from "react";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { uid } from "./utils";
import { type Gender, getNormalRange, getTestUnit } from "./tests-catalog";
import { addCalculatedTests, type DraftTest } from "./medical";

export interface LabProfile {
  name: string;
  nameEn: string;
  phone: string;
  address: string;
  email: string;
  website: string;
  doctorName: string;
  doctorDegree: string;
  doctorSpecialty: string;
}

export interface SavedTest {
  name: string;
  categoryId: string;
  categoryAr: string;
  categoryEn: string;
  value: string;
  unit: string;
  customRange?: string;
  calculated?: boolean;
}

export interface Report {
  id: string;
  patientName: string;
  patientCode?: string;
  age: number;
  gender: Gender;
  phone?: string;
  nationalId?: string;
  sampleId?: string;
  doctor: string;
  createdAt: string;
  tests: SavedTest[];
  notes?: string;
}

export interface Draft {
  patientName: string;
  patientCode: string;
  age: string;
  gender: Gender | "";
  phone: string;
  nationalId: string;
  doctor: string;
  selectedCategoryIds: string[];
  tests: DraftTest[];
  notes: string;
  step: number;
}

const defaultLab: LabProfile = {
  name: "مختبر رجب للتحاليل الطبية",
  nameEn: "Rajab Diagnostics",
  phone: "0100 203 2030",
  address: "شارع القصر العيني، القاهرة",
  email: "lab@rajab.eg",
  website: "www.rajab.eg",
  doctorName: "د. رجب عبد الرحمن",
  doctorDegree: "دكتوراه الكيمياء الحيوية",
  doctorSpecialty: "الباثولوجيا الإكلينيكية",
};

function mkTest(
  name: string,
  value: string,
  categoryId: string,
  categoryAr: string,
  categoryEn: string,
  gender: Gender,
  customRange?: string,
): SavedTest {
  return {
    name,
    value,
    categoryId,
    categoryAr,
    categoryEn,
    unit: getTestUnit(name),
    customRange,
  };
}

function seedReports(): Report[] {
  const chemistry: SavedTest[] = [
    mkTest("Fasting Glucose", "150", "c5", "سكر", "Diabetes", "أنثى"),
    mkTest("Hemoglobin", "6.1", "c3", "صورة دم كاملة (CBC)", "Complete Blood Count", "أنثى"),
    mkTest("SGPT (ALT)", "25", "c1", "وظائف الكبد", "Liver Functions", "أنثى"),
    mkTest("SGOT (AST)", "22", "c1", "وظائف الكبد", "Liver Functions", "أنثى"),
  ];
  const r1Tests: SavedTest[] = [
    mkTest("SGPT (ALT)", "62", "c1", "وظائف الكبد", "Liver Functions", "ذكر"),
    mkTest("SGOT (AST)", "51", "c1", "وظائف الكبد", "Liver Functions", "ذكر"),
    mkTest("ALP", "88", "c1", "وظائف الكبد", "Liver Functions", "ذكر"),
    mkTest("Total Bilirubin", "0.8", "c1", "وظائف الكبد", "Liver Functions", "ذكر"),
    mkTest("Albumin", "4.1", "c1", "وظائف الكبد", "Liver Functions", "ذكر"),
    mkTest("Creatinine", "1.45", "c2", "وظائف الكلى", "Kidney Functions", "ذكر"),
    mkTest("Urea", "48", "c2", "وظائف الكلى", "Kidney Functions", "ذكر"),
    mkTest("Uric Acid", "6.1", "c2", "وظائف الكلى", "Kidney Functions", "ذكر"),
    mkTest("Fasting Glucose", "128", "c5", "سكر", "Diabetes", "ذكر"),
    mkTest("HbA1c", "6.4", "c5", "سكر", "Diabetes", "ذكر"),
    mkTest("WBCs", "7.2", "c3", "صورة دم كاملة (CBC)", "Complete Blood Count", "ذكر"),
    mkTest("Hemoglobin", "13.8", "c3", "صورة دم كاملة (CBC)", "Complete Blood Count", "ذكر"),
    mkTest("Platelets", "241", "c3", "صورة دم كاملة (CBC)", "Complete Blood Count", "ذكر"),
  ];
  const r2Tests: SavedTest[] = [
    mkTest("TSH", "5.9", "c7", "هرمونات الغدة الدرقية", "Thyroid", "أنثى"),
    mkTest("Free T4", "0.92", "c7", "هرمونات الغدة الدرقية", "Thyroid", "أنثى"),
    mkTest("Free T3", "2.8", "c7", "هرمونات الغدة الدرقية", "Thyroid", "أنثى"),
    mkTest("Vitamin D", "14", "c8", "فيتامينات ومعادن", "Vitamins & Minerals", "أنثى"),
    mkTest("Vitamin B12", "178", "c8", "فيتامينات ومعادن", "Vitamins & Minerals", "أنثى"),
    mkTest("Ferritin", "8", "c8", "فيتامينات ومعادن", "Vitamins & Minerals", "أنثى"),
    mkTest("Iron", "38", "c8", "فيتامينات ومعادن", "Vitamins & Minerals", "أنثى"),
    mkTest("Hemoglobin", "10.2", "c3", "صورة دم كاملة (CBC)", "Complete Blood Count", "أنثى"),
    mkTest("RBCs", "3.8", "c3", "صورة دم كاملة (CBC)", "Complete Blood Count", "أنثى"),
    mkTest("WBCs", "6.1", "c3", "صورة دم كاملة (CBC)", "Complete Blood Count", "أنثى"),
  ];
  const r3Tests: SavedTest[] = [
    mkTest("Total Cholesterol", "246", "c4", "دهون وقلب", "Lipid Profile", "ذكر"),
    mkTest("Triglycerides", "210", "c4", "دهون وقلب", "Lipid Profile", "ذكر"),
    mkTest("HDL", "32", "c4", "دهون وقلب", "Lipid Profile", "ذكر"),
    mkTest("Fasting Glucose", "98", "c5", "سكر", "Diabetes", "ذكر"),
    mkTest("Creatinine", "0.9", "c2", "وظائف الكلى", "Kidney Functions", "ذكر"),
  ];

  return [
    {
      id: "demo-chemistry",
      patientName: "هدى محمود",
      age: 39,
      gender: "أنثى",
      doctor: "أ.د. كريم",
      createdAt: new Date(Date.now() - 1000 * 60 * 60 * 5).toISOString(),
      tests: addCalculatedTests(chemistry, "أنثى", 39),
    },
    {
      id: "demo-ahmed",
      patientName: "أحمد حسن عبد الله",
      age: 52,
      gender: "ذكر",
      doctor: "د. سمير فؤاد",
      createdAt: new Date(Date.now() - 1000 * 60 * 60 * 26).toISOString(),
      tests: addCalculatedTests(r1Tests, "ذكر", 52),
      notes: "متابعة وظائف كبد وكلى مع صورة دم وسكر.",
    },
    {
      id: "demo-fatima",
      patientName: "فاطمة علي محمود",
      age: 28,
      gender: "أنثى",
      doctor: "د. منى الشافعي",
      createdAt: new Date(Date.now() - 1000 * 60 * 60 * 50).toISOString(),
      tests: addCalculatedTests(r2Tests, "أنثى", 28),
      notes: "شكوى إعياء وتساقط شعر — تقييم غدة وحديد وفيتامينات.",
    },
    {
      id: "demo-karim",
      patientName: "كريم عادل يوسف",
      age: 40,
      gender: "ذكر",
      doctor: "Himself",
      createdAt: new Date(Date.now() - 1000 * 60 * 60 * 8).toISOString(),
      tests: addCalculatedTests(r3Tests, "ذكر", 40),
    },
  ];
}

const emptyDraft = (): Draft => ({
  patientName: "",
  patientCode: "",
  age: "",
  gender: "",
  phone: "",
  nationalId: "",
  doctor: "",
  selectedCategoryIds: [],
  tests: [],
  notes: "",
  step: 0,
});

interface LabState {
  lab: LabProfile;
  reports: Report[];
  draft: Draft;
  setLab: (patch: Partial<LabProfile>) => void;
  setDraft: (patch: Partial<Draft>) => void;
  resetDraft: () => void;
  saveDraftAsReport: () => Report | null;
  deleteReport: (id: string) => void;
  restoreDemo: () => void;
}

export const useLabStore = create<LabState>()(
  persist(
    (set, get) => ({
      lab: defaultLab,
      reports: seedReports(),
      draft: emptyDraft(),
      setLab: (patch) => set({ lab: { ...defaultLab, ...get().lab, ...patch } }),
      setDraft: (patch) => set({ draft: { ...get().draft, ...patch } }),
      resetDraft: () => set({ draft: emptyDraft() }),
      saveDraftAsReport: () => {
        const { draft, reports } = get();
        const age = Number(draft.age);
        if (!draft.patientName.trim() || !draft.gender || !age) return null;
        const tests = addCalculatedTests(
          draft.tests.filter((t) => t.value.trim()),
          draft.gender,
          age,
        );
        if (tests.length === 0) return null;
        const report: Report = {
          id: uid("rep"),
          patientName: draft.patientName.trim(),
          age,
          gender: draft.gender,
          doctor: draft.doctor.trim() || "Himself",
          createdAt: new Date().toISOString(),
          tests,
          notes: draft.notes.trim() || undefined,
        };
        set({ reports: [report, ...reports], draft: emptyDraft() });
        return report;
      },
      deleteReport: (id) =>
        set({ reports: get().reports.filter((r) => r.id !== id) }),
      restoreDemo: () =>
        set({ lab: defaultLab, reports: seedReports(), draft: emptyDraft() }),
    }),
    { name: "rajab-lab-v2" },
  ),
);

export { defaultLab };

export function useHasHydrated() {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    const finish = () => setHydrated(true);
    const unsub = useLabStore.persist.onFinishHydration(finish);
    if (useLabStore.persist.hasHydrated()) finish();
    return unsub;
  }, []);
  return hydrated;
}

