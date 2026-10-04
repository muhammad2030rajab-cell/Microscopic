import type { LabReport } from "@/lib/lab-reports";

/** A fixed, made-up approved report used only for the live preview in the settings page. */
export const SAMPLE_REPORT: LabReport = {
  id: "sample-report-preview",
  patientName: "أحمد حسن عبد الله",
  patientCode: "P-0001",
  age: 45,
  ageUnit: "years",
  gender: "ذكر",
  phone: "0100 000 0000",
  sampleId: "S-10234",
  doctor: "د. سمير فؤاد",
  createdAt: "2026-09-12T08:30:00.000Z",
  collectedAt: "2026-09-12T08:00:00.000Z",
  notes: "عينة صائم 12 ساعة.",
  status: "approved",
  approvedAt: "2026-09-12T11:00:00.000Z",
  tests: [
    { name: "Hemoglobin", categoryId: "sample-cbc", categoryAr: "صورة دم كاملة", categoryEn: "Complete Blood Count", value: "14.2", unit: "g/dL", customRange: "13 - 17" },
    { name: "WBC", categoryId: "sample-cbc", categoryAr: "صورة دم كاملة", categoryEn: "Complete Blood Count", value: "11.8", unit: "10^3/µL", customRange: "4 - 10" },
    { name: "SGPT (ALT)", categoryId: "sample-liver", categoryAr: "وظائف الكبد", categoryEn: "Liver Function", value: "62", unit: "U/L", customRange: "حتى 41" },
    { name: "Creatinine", categoryId: "sample-kidney", categoryAr: "وظائف الكلى", categoryEn: "Kidney Function", value: "0.9", unit: "mg/dL", customRange: "0.7 - 1.3" },
  ],
} as LabReport;
