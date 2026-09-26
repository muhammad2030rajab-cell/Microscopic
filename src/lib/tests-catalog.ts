export type Gender = "ذكر" | "أنثى";

export interface TestDef {
  name: string;
  unit: string;
  male: string;
  female: string;
}

export interface Category {
  id: string;
  nameAr: string;
  nameEn: string;
  tests: TestDef[];
}

export const CATEGORIES: Category[] = [
  {
    "id": "c1",
    "nameAr": "وظائف الكبد",
    "nameEn": "Liver Functions",
    "tests": [
      {
        "name": "SGPT (ALT)",
        "unit": "U/L",
        "male": "حتى 45",
        "female": "حتى 35"
      },
      {
        "name": "SGOT (AST)",
        "unit": "U/L",
        "male": "حتى 40",
        "female": "حتى 35"
      },
      {
        "name": "ALP",
        "unit": "U/L",
        "male": "حتى 130",
        "female": "حتى 130"
      },
      {
        "name": "GGT",
        "unit": "U/L",
        "male": "حتى 55",
        "female": "حتى 38"
      },
      {
        "name": "Total Bilirubin",
        "unit": "mg/dL",
        "male": "حتى 1.2",
        "female": "حتى 1.2"
      },
      {
        "name": "Direct Bilirubin",
        "unit": "mg/dL",
        "male": "حتى 0.3",
        "female": "حتى 0.3"
      },
      {
        "name": "Indirect Bilirubin",
        "unit": "mg/dL",
        "male": "حتى 0.9",
        "female": "حتى 0.9"
      },
      {
        "name": "Total Protein",
        "unit": "g/dL",
        "male": "6.6-8.3",
        "female": "6.6-8.3"
      },
      {
        "name": "Albumin",
        "unit": "g/dL",
        "male": "3.5-5.0",
        "female": "3.5-5.0"
      },
      {
        "name": "Globulin",
        "unit": "g/dL",
        "male": "2.3-3.5",
        "female": "2.3-3.5"
      },
      {
        "name": "A/G Ratio",
        "unit": "",
        "male": "1.0-2.5",
        "female": "1.0-2.5"
      },
      {
        "name": "LDH",
        "unit": "U/L",
        "male": "140-280",
        "female": "140-280"
      },
      {
        "name": "5-Nucleotidase",
        "unit": "U/L",
        "male": "حتى 15",
        "female": "حتى 15"
      }
    ]
  },
  {
    "id": "c2",
    "nameAr": "وظائف الكلى",
    "nameEn": "Kidney Functions",
    "tests": [
      {
        "name": "Creatinine",
        "unit": "mg/dL",
        "male": "0.7-1.2",
        "female": "0.6-1.1"
      },
      {
        "name": "Urea",
        "unit": "mg/dL",
        "male": "15-45",
        "female": "15-45"
      },
      {
        "name": "BUN",
        "unit": "mg/dL",
        "male": "7-20",
        "female": "7-20"
      },
      {
        "name": "Uric Acid",
        "unit": "mg/dL",
        "male": "3.5-7.2",
        "female": "2.6-6.0"
      },
      {
        "name": "Sodium",
        "unit": "mmol/L",
        "male": "135-145",
        "female": "135-145"
      },
      {
        "name": "Potassium",
        "unit": "mmol/L",
        "male": "3.5-5.1",
        "female": "3.5-5.1"
      },
      {
        "name": "Chloride",
        "unit": "mmol/L",
        "male": "98-108",
        "female": "98-108"
      },
      {
        "name": "Calcium",
        "unit": "mg/dL",
        "male": "8.5-10.5",
        "female": "8.5-10.5"
      },
      {
        "name": "Ionized Calcium",
        "unit": "mg/dL",
        "male": "4.5-5.3",
        "female": "4.5-5.3"
      },
      {
        "name": "Phosphorus",
        "unit": "mg/dL",
        "male": "2.5-4.5",
        "female": "2.5-4.5"
      },
      {
        "name": "Magnesium",
        "unit": "mg/dL",
        "male": "1.7-2.5",
        "female": "1.7-2.5"
      },
      {
        "name": "eGFR",
        "unit": "mL/min",
        "male": "أكثر من 90",
        "female": "أكثر من 90"
      }
    ]
  },
  {
    "id": "c3",
    "nameAr": "صورة دم كاملة (CBC)",
    "nameEn": "Complete Blood Count",
    "tests": [
      {
        "name": "WBCs",
        "unit": "x10^3/μL",
        "male": "4.0-11.0",
        "female": "4.0-11.0"
      },
      {
        "name": "RBCs",
        "unit": "x10^6/μL",
        "male": "4.5-6.0",
        "female": "4.0-5.5"
      },
      {
        "name": "Hemoglobin",
        "unit": "g/dL",
        "male": "13.5-17.5",
        "female": "12.0-15.5"
      },
      {
        "name": "Hematocrit",
        "unit": "%",
        "male": "40-52",
        "female": "36-47"
      },
      {
        "name": "MCV",
        "unit": "fL",
        "male": "80-100",
        "female": "80-100"
      },
      {
        "name": "MCH",
        "unit": "pg",
        "male": "27-34",
        "female": "27-34"
      },
      {
        "name": "MCHC",
        "unit": "g/dL",
        "male": "32-36",
        "female": "32-36"
      },
      {
        "name": "RDW",
        "unit": "%",
        "male": "11.5-14.5",
        "female": "11.5-14.5"
      },
      {
        "name": "Platelets",
        "unit": "x10^3/μL",
        "male": "150-450",
        "female": "150-450"
      },
      {
        "name": "MPV",
        "unit": "fL",
        "male": "7.5-11.5",
        "female": "7.5-11.5"
      },
      {
        "name": "Neutrophils",
        "unit": "%",
        "male": "40-70",
        "female": "40-70"
      },
      {
        "name": "Lymphocytes",
        "unit": "%",
        "male": "20-40",
        "female": "20-40"
      },
      {
        "name": "Monocytes",
        "unit": "%",
        "male": "2-8",
        "female": "2-8"
      },
      {
        "name": "Eosinophils",
        "unit": "%",
        "male": "1-4",
        "female": "1-4"
      },
      {
        "name": "Basophils",
        "unit": "%",
        "male": "0.5-1",
        "female": "0.5-1"
      },
      {
        "name": "Absolute Neutrophils",
        "unit": "x10^3/μL",
        "male": "2.0-7.0",
        "female": "2.0-7.0"
      },
      {
        "name": "Absolute Lymphocytes",
        "unit": "x10^3/μL",
        "male": "1.0-3.0",
        "female": "1.0-3.0"
      },
      {
        "name": "Absolute Monocytes",
        "unit": "x10^3/μL",
        "male": "0.2-1.0",
        "female": "0.2-1.0"
      },
      {
        "name": "Absolute Eosinophils",
        "unit": "x10^3/μL",
        "male": "0.02-0.5",
        "female": "0.02-0.5"
      },
      {
        "name": "Absolute Basophils",
        "unit": "x10^3/μL",
        "male": "0.02-0.1",
        "female": "0.02-0.1"
      }
    ]
  },
  {
    "id": "c4",
    "nameAr": "دهون وقلب",
    "nameEn": "Lipid Profile",
    "tests": [
      {
        "name": "Total Cholesterol",
        "unit": "mg/dL",
        "male": "حتى 200",
        "female": "حتى 200"
      },
      {
        "name": "Triglycerides",
        "unit": "mg/dL",
        "male": "حتى 150",
        "female": "حتى 150"
      },
      {
        "name": "HDL",
        "unit": "mg/dL",
        "male": "أكثر من 40",
        "female": "أكثر من 50"
      },
      {
        "name": "LDL",
        "unit": "mg/dL",
        "male": "حتى 100",
        "female": "حتى 100"
      },
      {
        "name": "VLDL",
        "unit": "mg/dL",
        "male": "5-30",
        "female": "5-30"
      },
      {
        "name": "Non-HDL Cholesterol",
        "unit": "mg/dL",
        "male": "حتى 130",
        "female": "حتى 130"
      },
      {
        "name": "Cholesterol/HDL Ratio",
        "unit": "",
        "male": "أقل من 5",
        "female": "أقل من 4.5"
      },
      {
        "name": "Apo A1",
        "unit": "mg/dL",
        "male": "115-220",
        "female": "115-220"
      },
      {
        "name": "Apo B",
        "unit": "mg/dL",
        "male": "55-125",
        "female": "55-125"
      },
      {
        "name": "Lipoprotein (a)",
        "unit": "mg/dL",
        "male": "أقل من 30",
        "female": "أقل من 30"
      }
    ]
  },
  {
    "id": "c5",
    "nameAr": "سكر",
    "nameEn": "Diabetes",
    "tests": [
      {
        "name": "Fasting Glucose",
        "unit": "mg/dL",
        "male": "70-100",
        "female": "70-100"
      },
      {
        "name": "Random Glucose",
        "unit": "mg/dL",
        "male": "حتى 140",
        "female": "حتى 140"
      },
      {
        "name": "HbA1c",
        "unit": "%",
        "male": "أقل من 5.7",
        "female": "أقل من 5.7"
      },
      {
        "name": "2h Postprandial",
        "unit": "mg/dL",
        "male": "حتى 140",
        "female": "حتى 140"
      },
      {
        "name": "Insulin",
        "unit": "μIU/mL",
        "male": "2-25",
        "female": "2-25"
      },
      {
        "name": "C-Peptide",
        "unit": "ng/mL",
        "male": "0.5-2.7",
        "female": "0.5-2.7"
      },
      {
        "name": "Fructosamine",
        "unit": "μmol/L",
        "male": "200-285",
        "female": "200-285"
      },
      {
        "name": "Microalbumin",
        "unit": "mg/L",
        "male": "أقل من 20",
        "female": "أقل من 20"
      }
    ]
  },
  {
    "id": "c6",
    "nameAr": "إنزيمات القلب",
    "nameEn": "Cardiac Enzymes",
    "tests": [
      {
        "name": "CK",
        "unit": "U/L",
        "male": "55-170",
        "female": "30-145"
      },
      {
        "name": "CK-MB",
        "unit": "U/L",
        "male": "أقل من 25",
        "female": "أقل من 25"
      },
      {
        "name": "Troponin I",
        "unit": "ng/mL",
        "male": "أقل من 0.04",
        "female": "أقل من 0.04"
      },
      {
        "name": "Troponin T",
        "unit": "ng/mL",
        "male": "أقل من 0.01",
        "female": "أقل من 0.01"
      },
      {
        "name": "LDH",
        "unit": "U/L",
        "male": "140-280",
        "female": "140-280"
      },
      {
        "name": "Myoglobin",
        "unit": "ng/mL",
        "male": "أقل من 90",
        "female": "أقل من 65"
      },
      {
        "name": "BNP",
        "unit": "pg/mL",
        "male": "أقل من 100",
        "female": "أقل من 100"
      },
      {
        "name": "Pro-BNP",
        "unit": "pg/mL",
        "male": "أقل من 125",
        "female": "أقل من 125"
      }
    ]
  },
  {
    "id": "c7",
    "nameAr": "هرمونات الغدة الدرقية",
    "nameEn": "Thyroid",
    "tests": [
      {
        "name": "TSH",
        "unit": "mIU/L",
        "male": "0.4-4.5",
        "female": "0.4-4.5"
      },
      {
        "name": "T3",
        "unit": "ng/dL",
        "male": "80-200",
        "female": "80-200"
      },
      {
        "name": "T4",
        "unit": "μg/dL",
        "male": "5-12",
        "female": "5-12"
      },
      {
        "name": "Free T3",
        "unit": "pg/mL",
        "male": "2.3-4.2",
        "female": "2.3-4.2"
      },
      {
        "name": "Free T4",
        "unit": "ng/dL",
        "male": "0.8-1.8",
        "female": "0.8-1.8"
      },
      {
        "name": "Thyroglobulin",
        "unit": "ng/mL",
        "male": "3-40",
        "female": "3-40"
      },
      {
        "name": "Anti-TPO",
        "unit": "IU/mL",
        "male": "أقل من 35",
        "female": "أقل من 35"
      },
      {
        "name": "Anti-Tg",
        "unit": "IU/mL",
        "male": "أقل من 40",
        "female": "أقل من 40"
      }
    ]
  },
  {
    "id": "c8",
    "nameAr": "فيتامينات ومعادن",
    "nameEn": "Vitamins & Minerals",
    "tests": [
      {
        "name": "Vitamin D",
        "unit": "ng/mL",
        "male": "30-100",
        "female": "30-100"
      },
      {
        "name": "Vitamin B12",
        "unit": "pg/mL",
        "male": "200-900",
        "female": "200-900"
      },
      {
        "name": "Vitamin A",
        "unit": "μg/dL",
        "male": "30-80",
        "female": "30-80"
      },
      {
        "name": "Vitamin E",
        "unit": "mg/dL",
        "male": "5-18",
        "female": "5-18"
      },
      {
        "name": "Vitamin K",
        "unit": "ng/mL",
        "male": "0.2-3.2",
        "female": "0.2-3.2"
      },
      {
        "name": "Folate",
        "unit": "ng/mL",
        "male": "3-20",
        "female": "3-20"
      },
      {
        "name": "Ferritin",
        "unit": "ng/mL",
        "male": "24-336",
        "female": "11-307"
      },
      {
        "name": "Iron",
        "unit": "μg/dL",
        "male": "65-175",
        "female": "50-170"
      },
      {
        "name": "TIBC",
        "unit": "μg/dL",
        "male": "250-450",
        "female": "250-450"
      },
      {
        "name": "Transferrin",
        "unit": "mg/dL",
        "male": "200-360",
        "female": "200-360"
      },
      {
        "name": "Zinc",
        "unit": "μg/dL",
        "male": "70-120",
        "female": "70-120"
      },
      {
        "name": "Copper",
        "unit": "μg/dL",
        "male": "70-140",
        "female": "80-155"
      },
      {
        "name": "Selenium",
        "unit": "μg/L",
        "male": "70-150",
        "female": "70-150"
      }
    ]
  },
  {
    "id": "c9",
    "nameAr": "سيولة ودم",
    "nameEn": "Coagulation",
    "tests": [
      {
        "name": "PT",
        "unit": "sec",
        "male": "11-13.5",
        "female": "11-13.5"
      },
      {
        "name": "PTT",
        "unit": "sec",
        "male": "25-35",
        "female": "25-35"
      },
      {
        "name": "INR",
        "unit": "",
        "male": "0.8-1.1",
        "female": "0.8-1.1"
      },
      {
        "name": "Fibrinogen",
        "unit": "mg/dL",
        "male": "200-400",
        "female": "200-400"
      },
      {
        "name": "D-Dimer",
        "unit": "μg/mL",
        "male": "أقل من 0.5",
        "female": "أقل من 0.5"
      },
      {
        "name": "Bleeding Time",
        "unit": "min",
        "male": "2-9",
        "female": "2-9"
      },
      {
        "name": "Clotting Time",
        "unit": "min",
        "male": "5-15",
        "female": "5-15"
      },
      {
        "name": "Protein C",
        "unit": "%",
        "male": "70-140",
        "female": "70-140"
      },
      {
        "name": "Protein S",
        "unit": "%",
        "male": "70-140",
        "female": "60-130"
      },
      {
        "name": "Antithrombin III",
        "unit": "%",
        "male": "80-120",
        "female": "80-120"
      }
    ]
  },
  {
    "id": "c10",
    "nameAr": "التهابات وروماتيزم",
    "nameEn": "Inflammation",
    "tests": [
      {
        "name": "CRP",
        "unit": "mg/L",
        "male": "أقل من 6",
        "female": "أقل من 6"
      },
      {
        "name": "HS-CRP",
        "unit": "mg/L",
        "male": "أقل من 2",
        "female": "أقل من 2"
      },
      {
        "name": "ESR 1st Hour",
        "unit": "mm/hr",
        "male": "0-15",
        "female": "0-20"
      },
      {
        "name": "ESR 2nd Hour",
        "unit": "mm/hr",
        "male": "0-30",
        "female": "0-35"
      },
      {
        "name": "RF",
        "unit": "IU/mL",
        "male": "أقل من 20",
        "female": "أقل من 20"
      },
      {
        "name": "ASO",
        "unit": "IU/mL",
        "male": "أقل من 200",
        "female": "أقل من 200"
      },
      {
        "name": "ANA",
        "unit": "Titer",
        "male": "Negative",
        "female": "Negative"
      },
      {
        "name": "Anti-CCP",
        "unit": "U/mL",
        "male": "أقل من 20",
        "female": "أقل من 20"
      },
      {
        "name": "HLA-B27",
        "unit": "",
        "male": "Negative",
        "female": "Negative"
      }
    ]
  },
  {
    "id": "c11",
    "nameAr": "أورام (Tumor Markers)",
    "nameEn": "Tumor Markers",
    "tests": [
      {
        "name": "PSA",
        "unit": "ng/mL",
        "male": "أقل من 4",
        "female": "أقل من 0.5"
      },
      {
        "name": "Free PSA",
        "unit": "ng/mL",
        "male": "أقل من 1",
        "female": "N/A"
      },
      {
        "name": "CEA",
        "unit": "ng/mL",
        "male": "أقل من 5",
        "female": "أقل من 5"
      },
      {
        "name": "AFP",
        "unit": "ng/mL",
        "male": "أقل من 10",
        "female": "أقل من 10"
      },
      {
        "name": "CA 15-3",
        "unit": "U/mL",
        "male": "أقل من 30",
        "female": "أقل من 30"
      },
      {
        "name": "CA 19-9",
        "unit": "U/mL",
        "male": "أقل من 37",
        "female": "أقل من 37"
      },
      {
        "name": "CA 125",
        "unit": "U/mL",
        "male": "أقل من 35",
        "female": "أقل من 35"
      },
      {
        "name": "Beta-hCG",
        "unit": "mIU/mL",
        "male": "أقل من 5",
        "female": "أقل من 5"
      },
      {
        "name": "Calcitonin",
        "unit": "pg/mL",
        "male": "أقل من 10",
        "female": "أقل من 5"
      },
      {
        "name": "Chromogranin A",
        "unit": "ng/mL",
        "male": "أقل من 100",
        "female": "أقل من 100"
      }
    ]
  },
  {
    "id": "c12",
    "nameAr": "تحليل بول",
    "nameEn": "Urine Analysis",
    "tests": [
      {
        "name": "Color",
        "unit": "",
        "male": "Yellow",
        "female": "Yellow"
      },
      {
        "name": "Appearance",
        "unit": "",
        "male": "Clear",
        "female": "Clear"
      },
      {
        "name": "Specific Gravity",
        "unit": "",
        "male": "1.005-1.030",
        "female": "1.005-1.030"
      },
      {
        "name": "pH",
        "unit": "",
        "male": "5-8",
        "female": "5-8"
      },
      {
        "name": "Protein",
        "unit": "mg/dL",
        "male": "Negative",
        "female": "Negative"
      },
      {
        "name": "Glucose",
        "unit": "mg/dL",
        "male": "Negative",
        "female": "Negative"
      },
      {
        "name": "Ketones",
        "unit": "mg/dL",
        "male": "Negative",
        "female": "Negative"
      },
      {
        "name": "Bilirubin",
        "unit": "",
        "male": "Negative",
        "female": "Negative"
      },
      {
        "name": "Blood",
        "unit": "",
        "male": "Negative",
        "female": "Negative"
      },
      {
        "name": "Leukocytes",
        "unit": "",
        "male": "Negative",
        "female": "Negative"
      },
      {
        "name": "Nitrite",
        "unit": "",
        "male": "Negative",
        "female": "Negative"
      },
      {
        "name": "Urobilinogen",
        "unit": "mg/dL",
        "male": "0.2-1.0",
        "female": "0.2-1.0"
      },
      {
        "name": "RBCs in Urine",
        "unit": "/HPF",
        "male": "0-2",
        "female": "0-2"
      },
      {
        "name": "WBCs in Urine",
        "unit": "/HPF",
        "male": "0-5",
        "female": "0-5"
      },
      {
        "name": "Casts",
        "unit": "/LPF",
        "male": "0-5",
        "female": "0-5"
      },
      {
        "name": "Crystals",
        "unit": "",
        "male": "Few",
        "female": "Few"
      },
      {
        "name": "Bacteria",
        "unit": "",
        "male": "Negative",
        "female": "Negative"
      }
    ]
  },
  {
    "id": "c13",
    "nameAr": "تحليل براز",
    "nameEn": "Stool Analysis",
    "tests": [
      {
        "name": "Color",
        "unit": "",
        "male": "Brown",
        "female": "Brown"
      },
      {
        "name": "Consistency",
        "unit": "",
        "male": "Formed",
        "female": "Formed"
      },
      {
        "name": "Mucus",
        "unit": "",
        "male": "Negative",
        "female": "Negative"
      },
      {
        "name": "Blood",
        "unit": "",
        "male": "Negative",
        "female": "Negative"
      },
      {
        "name": "Pus Cells",
        "unit": "/HPF",
        "male": "0-2",
        "female": "0-2"
      },
      {
        "name": "RBCs",
        "unit": "/HPF",
        "male": "0-2",
        "female": "0-2"
      },
      {
        "name": "Ova & Parasites",
        "unit": "",
        "male": "Negative",
        "female": "Negative"
      },
      {
        "name": "Fat Globules",
        "unit": "",
        "male": "Few",
        "female": "Few"
      },
      {
        "name": "Undigested Food",
        "unit": "",
        "male": "Few",
        "female": "Few"
      },
      {
        "name": "Occult Blood",
        "unit": "",
        "male": "Negative",
        "female": "Negative"
      }
    ]
  },
  {
    "id": "c14",
    "nameAr": "هرمونات",
    "nameEn": "Hormones",
    "tests": [
      {
        "name": "Cortisol AM",
        "unit": "μg/dL",
        "male": "5-25",
        "female": "5-25"
      },
      {
        "name": "Cortisol PM",
        "unit": "μg/dL",
        "male": "3-16",
        "female": "3-16"
      },
      {
        "name": "ACTH",
        "unit": "pg/mL",
        "male": "10-60",
        "female": "10-60"
      },
      {
        "name": "Prolactin",
        "unit": "ng/mL",
        "male": "2-18",
        "female": "3-30"
      },
      {
        "name": "FSH",
        "unit": "mIU/mL",
        "male": "1.5-12",
        "female": "3-20"
      },
      {
        "name": "LH",
        "unit": "mIU/mL",
        "male": "1.5-9",
        "female": "2-15"
      },
      {
        "name": "Testosterone",
        "unit": "ng/dL",
        "male": "300-1000",
        "female": "15-70"
      },
      {
        "name": "Estradiol",
        "unit": "pg/mL",
        "male": "10-40",
        "female": "15-350"
      },
      {
        "name": "Progesterone",
        "unit": "ng/mL",
        "male": "0.2-1.4",
        "female": "0.2-25"
      },
      {
        "name": "DHEA-S",
        "unit": "μg/dL",
        "male": "100-450",
        "female": "45-320"
      },
      {
        "name": "Aldosterone",
        "unit": "ng/dL",
        "male": "4-31",
        "female": "4-31"
      },
      {
        "name": "Renin",
        "unit": "ng/mL/hr",
        "male": "0.5-4",
        "female": "0.5-4"
      },
      {
        "name": "PTH",
        "unit": "pg/mL",
        "male": "10-65",
        "female": "10-65"
      }
    ]
  },
  {
    "id": "c15",
    "nameAr": "أمراض معدية",
    "nameEn": "Infectious Diseases",
    "tests": [
      {
        "name": "HBsAg",
        "unit": "",
        "male": "Negative",
        "female": "Negative"
      },
      {
        "name": "Anti-HBs",
        "unit": "mIU/mL",
        "male": "أكثر من 10",
        "female": "أكثر من 10"
      },
      {
        "name": "HBcAb",
        "unit": "",
        "male": "Negative",
        "female": "Negative"
      },
      {
        "name": "HBeAg",
        "unit": "",
        "male": "Negative",
        "female": "Negative"
      },
      {
        "name": "Anti-HCV",
        "unit": "",
        "male": "Negative",
        "female": "Negative"
      },
      {
        "name": "HIV Ab",
        "unit": "",
        "male": "Negative",
        "female": "Negative"
      },
      {
        "name": "VDRL",
        "unit": "",
        "male": "Non-reactive",
        "female": "Non-reactive"
      },
      {
        "name": "TPHA",
        "unit": "",
        "male": "Negative",
        "female": "Negative"
      },
      {
        "name": "Widal Test",
        "unit": "Titer",
        "male": "أقل من 1:80",
        "female": "أقل من 1:80"
      },
      {
        "name": "Mantoux Test",
        "unit": "mm",
        "male": "أقل من 10",
        "female": "أقل من 10"
      },
      {
        "name": "EBV VCA IgM",
        "unit": "",
        "male": "Negative",
        "female": "Negative"
      },
      {
        "name": "CMV IgM",
        "unit": "",
        "male": "Negative",
        "female": "Negative"
      },
      {
        "name": "Rubella IgG",
        "unit": "IU/mL",
        "male": "أكثر من 10",
        "female": "أكثر من 10"
      }
    ]
  },
  {
    "id": "c16",
    "nameAr": "مناعة",
    "nameEn": "Immunology",
    "tests": [
      {
        "name": "IgG",
        "unit": "mg/dL",
        "male": "700-1600",
        "female": "700-1600"
      },
      {
        "name": "IgA",
        "unit": "mg/dL",
        "male": "70-400",
        "female": "70-400"
      },
      {
        "name": "IgM",
        "unit": "mg/dL",
        "male": "40-230",
        "female": "40-230"
      },
      {
        "name": "IgE",
        "unit": "IU/mL",
        "male": "أقل من 100",
        "female": "أقل من 100"
      },
      {
        "name": "C3",
        "unit": "mg/dL",
        "male": "90-180",
        "female": "90-180"
      },
      {
        "name": "C4",
        "unit": "mg/dL",
        "male": "10-40",
        "female": "10-40"
      },
      {
        "name": "CH50",
        "unit": "U/mL",
        "male": "30-75",
        "female": "30-75"
      }
    ]
  }
];

export const TEST_INDEX: Record<string, { test: TestDef; category: Category }> = {};
for (const category of CATEGORIES) {
  for (const test of category.tests) {
    TEST_INDEX[test.name] = { test, category };
  }
}

export function getNormalRange(testName: string, gender: Gender): string {
  const hit = TEST_INDEX[testName];
  if (!hit) return "غير محدد";
  return gender === "أنثى" ? hit.test.female : hit.test.male;
}

export function getTestUnit(testName: string): string {
  return TEST_INDEX[testName]?.test.unit ?? "";
}

export function getCategoryForTest(testName: string): Category | undefined {
  return TEST_INDEX[testName]?.category;
}

export function searchTests(query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const results: { test: TestDef; category: Category }[] = [];
  for (const category of CATEGORIES) {
    if (category.nameAr.includes(query) || category.nameEn.toLowerCase().includes(q)) {
      for (const test of category.tests) results.push({ test, category });
      continue;
    }
    for (const test of category.tests) {
      if (test.name.toLowerCase().includes(q)) results.push({ test, category });
    }
  }
  return results;
}

export const TOTAL_TESTS = Object.keys(TEST_INDEX).length;

