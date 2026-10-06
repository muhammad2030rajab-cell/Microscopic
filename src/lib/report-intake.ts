/**
 * Details taken at registration (like the paper form at the front desk): sample types, fasting,
 * clinical questions, referral entity. Pure module: validated here, stored as jsonb on the report.
 */
export const SAMPLE_TYPES = [
  { key: "blood", ar: "دم", en: "Blood" },
  { key: "urine", ar: "بول", en: "Urine" },
  { key: "stool", ar: "براز", en: "Stool" },
  { key: "semen", ar: "سائل منوي", en: "Semen" },
  { key: "csf", ar: "سائل شوكي", en: "CSF" },
] as const;

/** Clinical questions that change how results are read. Private: shown to staff, never printed. */
export const CLINICAL_FLAGS = [
  { key: "pregnant", ar: "حامل" },
  { key: "diabetesTreatment", ar: "بياخد علاج للسكر" },
  { key: "antibiotics", ar: "بياخد مضاد حيوي" },
  { key: "bloodThinner", ar: "بياخد علاج لسيولة الدم" },
  { key: "thyroidOrGlands", ar: "بياخد علاج للغدد" },
  { key: "liverTreatment", ar: "بياخد علاج للكبد" },
  { key: "antivirals", ar: "بياخد علاج للفيروسات" },
  { key: "priorTransfusion", ar: "سبق له نقل دم" },
  { key: "smoker", ar: "مدخّن" },
  { key: "contrastRecent", ar: "عمل أشعة بالصبغة مؤخرًا" },
] as const;

export type SampleTypeKey = (typeof SAMPLE_TYPES)[number]["key"];
export type ClinicalFlagKey = (typeof CLINICAL_FLAGS)[number]["key"];

export type Intake = {
  sampleTypes: SampleTypeKey[];
  fasting: boolean;
  /** Only meaningful when fasting; null = not recorded. */
  fastingHours: number | null;
  flags: ClinicalFlagKey[];
  /** Referring entity (clinic / hospital / company). */
  referral: string;
  vip: boolean;
  /** The sample was collected at another lab. */
  takenOutside: boolean;
};

export const EMPTY_INTAKE: Intake = {
  sampleTypes: [],
  fasting: false,
  fastingHours: null,
  flags: [],
  referral: "",
  vip: false,
  takenOutside: false,
};

const SAMPLE_KEYS = new Set<string>(SAMPLE_TYPES.map((s) => s.key));
const FLAG_KEYS = new Set<string>(CLINICAL_FLAGS.map((f) => f.key));

function keepKnown<T extends string>(value: unknown, allowed: Set<string>): T[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((v): v is T => typeof v === "string" && allowed.has(v)))];
}

/** Accepts anything (database json, persisted draft from an older version, form state) and returns a complete Intake. */
export function normalizeIntake(input: unknown): Intake {
  const o = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const fasting = o.fasting === true;
  const hours = Number(o.fastingHours);
  return {
    sampleTypes: keepKnown<SampleTypeKey>(o.sampleTypes, SAMPLE_KEYS),
    fasting,
    fastingHours: fasting && Number.isFinite(hours) && hours > 0 && hours <= 72 ? Math.round(hours) : null,
    flags: keepKnown<ClinicalFlagKey>(o.flags, FLAG_KEYS),
    referral: typeof o.referral === "string" ? o.referral.trim().replace(/\s+/g, " ").slice(0, 80) : "",
    vip: o.vip === true,
    takenOutside: o.takenOutside === true,
  };
}

/** True when nothing was recorded (so nothing needs storing). */
export function isEmptyIntake(i: Intake): boolean {
  return !i.sampleTypes.length && !i.fasting && !i.flags.length && !i.referral && !i.vip && !i.takenOutside;
}

/** One printable line for the report ("Blood, Urine · Fasting 12 h"); "" when there is nothing to print. */
export function sampleLine(i: Intake, lang: "ar" | "en"): string {
  const parts: string[] = [];
  if (i.sampleTypes.length) {
    parts.push(i.sampleTypes.map((k) => SAMPLE_TYPES.find((s) => s.key === k)![lang]).join(lang === "ar" ? "، " : ", "));
  }
  if (i.fasting) {
    parts.push(lang === "ar" ? (i.fastingHours ? `صائم ${i.fastingHours} ساعة` : "صائم") : i.fastingHours ? `Fasting ${i.fastingHours} h` : "Fasting");
  }
  return parts.join(" · ");
}
