import {
  type Gender,
  getCategoryForTest,
  getNormalRange,
  getTestUnit,
} from "./tests-catalog";

export type Flag = "normal" | "high" | "low" | "abnormal" | "unknown";

export interface NumericRange {
  min?: number;
  max?: number;
}

export interface Interpretation {
  flag: Flag;
  label: string;
  note: string;
}

const QUALITATIVE_NORMAL = new Set([
  "negative",
  "non-reactive",
  "yellow",
  "clear",
  "brown",
  "formed",
  "few",
  "n/a",
]);

export function parseRange(text: string): NumericRange | null {
  if (!text) return null;
  const t = text.trim();
  if (!t || t.includes(":") || QUALITATIVE_NORMAL.has(t.toLowerCase())) return null;

  const firstNum = (s: string) => {
    const m = s.replace(/,/g, "").match(/-?\d+(?:\.\d+)?/);
    return m ? Number(m[0]) : undefined;
  };

  if (t.startsWith("حتى") || t.startsWith("أقل من") || t.startsWith("Up To") || t.startsWith("Less")) {
    const max = firstNum(t);
    return max == null ? null : { max };
  }
  if (t.startsWith("أكثر من") || t.startsWith("More")) {
    const min = firstNum(t);
    return min == null ? null : { min };
  }
  const dash = t.match(/^(-?\d+(?:\.\d+)?)\s*[-–]\s*(-?\d+(?:\.\d+)?)$/);
  if (dash) return { min: Number(dash[1]), max: Number(dash[2]) };
  return null;
}

export function parseValue(value: string): number | null {
  const m = value.replace(/,/g, "").match(/-?\d+(?:\.\d+)?/);
  if (!m) return null;
  const n = Number(m[0]);
  return Number.isFinite(n) ? n : null;
}

const HIGH_NOTES: Record<string, string> = {
  "SGPT (ALT)": "ارتفاع إنزيمات الكبد قد يشير إلى التهاب كبدي.",
  "SGOT (AST)": "ارتفاع إنزيمات الكبد قد يشير إلى تلف في خلايا الكبد.",
  ALP: "قد يرتبط بانسداد صفراوي أو أمراض عظمية.",
  GGT: "قد يرتبط بالكبد أو الإفراط في تناول الكحول.",
  "Total Bilirubin": "قد يشير إلى يرقان أو اضطراب في تصريف الصفراء.",
  Creatinine: "ارتفاع الكرياتينين قد يشير إلى ضعف وظائف الكلى.",
  Urea: "ارتفاع اليوريا قد يشير إلى الجفاف أو مشاكل كلوية.",
  BUN: "قد يشير إلى جفاف أو قصور كلوي.",
  "Uric Acid": "ارتفاع حمض اليوريك يزيد خطر النقرس.",
  "Fasting Glucose": "ارتفاع السكر الصائم قد يشير إلى مقدمات سكري أو سكري.",
  "Random Glucose": "ارتفاع السكر العشوائي يستدعي تقييماً للسكري.",
  HbA1c: "يعكس ضبط السكر خلال الأشهر الثلاثة الماضية.",
  "Total Cholesterol": "ارتفاع الكوليسترول يزيد الخطر القلبي.",
  Triglycerides: "ارتفاع الدهون الثلاثية يرتبط بخطر القلب والبنكرياس.",
  LDL: "الكوليسترول الضار مرتفع — خطر تصلب الشرايين.",
  TSH: "قد يشير إلى قصور الغدة الدرقية.",
  CRP: "مؤشر التهاب نشط.",
  "HS-CRP": "التهاب منخفض الدرجة — عامل خطر قلبي.",
  PSA: "يستدعي المتابعة حسب العمر والعيادة.",
  WBCs: "قد يشير إلى عدوى أو التهاب.",
  Platelets: "قد يزيد خطر التجلط.",
  Potassium: "فرط البوتاسيوم حالة تستدعي اهتماماً عاجلاً إذا كان شديداً.",
  Sodium: "اضطراب الصوديوم يؤثر على التوازن المائي والعصبي.",
};

const LOW_NOTES: Record<string, string> = {
  Hemoglobin: "انخفاض الهيموجلوبين قد يشير إلى فقر الدم.",
  RBCs: "انخفاض كريات الدم الحمراء قد يشير إلى فقر الدم.",
  WBCs: "انخفاض كريات الدم البيضاء قد يشير إلى ضعف المناعة.",
  Platelets: "انخفاض الصفائح قد يزيد خطر النزيف.",
  "Vitamin D": "نقص فيتامين د قد يؤثر على صحة العظام.",
  "Vitamin B12": "نقص ب12 قد يسبب فقر دم واعتلالاً عصبياً.",
  Ferritin: "مخزون الحديد منخفض.",
  Iron: "قد يشير إلى نقص الحديد.",
  HDL: "الكوليسترول الحامي منخفض.",
  Albumin: "قد يرتبط بسوء تغذية أو مرض كبدي/كلوي.",
  TSH: "قد يشير إلى نشاط زائد في الغدة الدرقية.",
  Sodium: "نقص الصوديوم يؤثر على التركيز والتوازن.",
  Potassium: "نقص البوتاسيوم قد يسبب ضعفاً واضطراب نظم.",
};

function noteFor(name: string, table: Record<string, string>, fallback: string) {
  if (table[name]) return table[name];
  for (const [key, val] of Object.entries(table)) {
    if (name.includes(key) || key.includes(name)) return val;
  }
  return fallback;
}

export function interpretResult(
  testName: string,
  value: string,
  gender: Gender,
  customRange?: string,
): Interpretation {
  const rangeText = customRange?.trim() || getNormalRange(testName, gender);
  const trimmed = value.trim();
  if (!trimmed) {
    return { flag: "unknown", label: "بدون قيمة", note: "لم تُدخل نتيجة بعد." };
  }

  const qualitative = QUALITATIVE_NORMAL.has(rangeText.toLowerCase());
  if (qualitative) {
    const ok = trimmed.toLowerCase() === rangeText.toLowerCase();
    return ok
      ? { flag: "normal", label: "طبيعي", note: "النتيجة ضمن المتوقع." }
      : {
          flag: "abnormal",
          label: "غير طبيعي",
          note: `المتوقع: ${rangeText}`,
        };
  }

  const range = parseRange(rangeText);
  const num = parseValue(trimmed);
  if (range == null || num == null) {
    return { flag: "unknown", label: "وصفي", note: `المرجع: ${rangeText}` };
  }

  if (range.max != null && num > range.max) {
    return {
      flag: "high",
      label: "مرتفع",
      note: noteFor(testName, HIGH_NOTES, "النتيجة أعلى من المعدل الطبيعي."),
    };
  }
  if (range.min != null && num < range.min) {
    return {
      flag: "low",
      label: "منخفض",
      note: noteFor(testName, LOW_NOTES, "النتيجة أقل من المعدل الطبيعي."),
    };
  }
  return { flag: "normal", label: "طبيعي", note: "النتيجة ضمن المعدل الطبيعي." };
}

export function isCritical(testName: string, value: string): boolean {
  const num = parseValue(value);
  if (num == null) return false;
  const rules: Record<string, { high?: number; low?: number }> = {
    "Fasting Glucose": { high: 300, low: 50 },
    "Random Glucose": { high: 300, low: 50 },
    Glucose: { high: 300, low: 50 },
    Potassium: { high: 6.5, low: 2.5 },
    Sodium: { high: 155, low: 120 },
    Hemoglobin: { low: 7 },
    "Troponin I": { high: 0.04 },
    "Troponin T": { high: 0.01 },
    Creatinine: { high: 4 },
  };
  const rule = rules[testName];
  if (!rule) return false;
  if (rule.high != null && num > rule.high) return true;
  if (rule.low != null && num < rule.low) return true;
  return false;
}

export interface DraftTest {
  name: string;
  categoryId: string;
  categoryAr: string;
  categoryEn: string;
  value: string;
  unit: string;
  customRange?: string;
  calculated?: boolean;
}

function numFrom(tests: DraftTest[], name: string): number | null {
  const hit = tests.find((t) => t.name === name);
  return hit ? parseValue(hit.value) : null;
}

export function addCalculatedTests(
  tests: DraftTest[],
  gender: Gender,
  age: number,
): DraftTest[] {
  const extra: DraftTest[] = [];
  const has = (name: string) => tests.some((t) => t.name === name) || extra.some((t) => t.name === name);

  const push = (name: string, value: number, digits = 1) => {
    if (has(name) || !Number.isFinite(value)) return;
    const cat = getCategoryForTest(name);
    extra.push({
      name,
      categoryId: cat?.id ?? "calc",
      categoryAr: cat?.nameAr ?? "محسوب",
      categoryEn: cat?.nameEn ?? "Calculated",
      value: value.toFixed(digits),
      unit: getTestUnit(name),
      calculated: true,
    });
  };

  const alb = numFrom(tests, "Albumin");
  const glob = numFrom(tests, "Globulin");
  const tp = numFrom(tests, "Total Protein");
  if (glob == null && alb != null && tp != null) {
    push("Globulin", tp - alb, 1);
  }
  const glob2 = glob ?? (alb != null && tp != null ? tp - alb : null);
  if (alb != null && glob2 != null && glob2 > 0) {
    push("A/G Ratio", alb / glob2, 2);
  }

  const tc = numFrom(tests, "Total Cholesterol");
  const hdl = numFrom(tests, "HDL");
  const tg = numFrom(tests, "Triglycerides");
  if (tc != null && hdl != null && tg != null && tg < 400) {
    push("LDL", tc - hdl - tg / 5, 0);
  }
  if (tc != null && hdl != null) {
    push("Non-HDL Cholesterol", tc - hdl, 0);
    if (hdl > 0) push("Cholesterol/HDL Ratio", tc / hdl, 1);
  }
  if (tg != null) push("VLDL", tg / 5, 0);

  const ast = numFrom(tests, "SGOT (AST)");
  const alt = numFrom(tests, "SGPT (ALT)");
  if (ast != null && alt != null && alt > 0) {
    extra.push({
      name: "AST/ALT Ratio",
      categoryId: "c1",
      categoryAr: "وظائف الكبد",
      categoryEn: "Liver Functions",
      value: (ast / alt).toFixed(2),
      unit: "",
      customRange: "أقل من 1",
      calculated: true,
    });
  }

  const totalB = numFrom(tests, "Total Bilirubin");
  const directB = numFrom(tests, "Direct Bilirubin");
  if (totalB != null && directB != null) {
    push("Indirect Bilirubin", Math.max(0, totalB - directB), 2);
  }

  const crea = numFrom(tests, "Creatinine");
  if (crea != null && crea > 0 && age > 0) {
    let egfr: number;
    if (gender === "أنثى") {
      egfr =
        crea <= 0.7
          ? 144 * (crea / 0.7) ** -0.329 * 0.993 ** age
          : 144 * (crea / 0.7) ** -1.209 * 0.993 ** age;
    } else {
      egfr =
        crea <= 0.9
          ? 141 * (crea / 0.9) ** -0.411 * 0.993 ** age
          : 141 * (crea / 0.9) ** -1.209 * 0.993 ** age;
    }
    push("eGFR", egfr, 0);
  }

  const bun = numFrom(tests, "BUN");
  if (bun != null && crea != null && crea > 0) {
    extra.push({
      name: "BUN/Creatinine",
      categoryId: "c2",
      categoryAr: "وظائف الكلى",
      categoryEn: "Kidney Functions",
      value: (bun / crea).toFixed(1),
      unit: "",
      customRange: "10-20",
      calculated: true,
    });
  }

  return [...tests, ...extra];
}

export function rangeToEnglish(range: string, gender: Gender): string {
  const sex = gender === "أنثى" ? "Female" : "Male";
  if (range.startsWith("حتى")) return `${sex} Up To ${range.replace("حتى", "").trim()}`;
  if (range.startsWith("أقل من")) return `${sex} Less Than ${range.replace("أقل من", "").trim()}`;
  if (range.startsWith("أكثر من")) return `${sex} More Than ${range.replace("أكثر من", "").trim()}`;
  return `${sex} ${range}`;
}

export function flagLetter(flag: Flag): string {
  if (flag === "high") return "H";
  if (flag === "low") return "L";
  if (flag === "abnormal") return "A";
  return "";
}
