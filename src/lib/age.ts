/**
 * Patient age as a whole number in years, months or days — so a 3-month-old
 * can be registered (before, the smallest age was 1 year). Pure, no imports.
 *
 * Range logic always works in fractional YEARS (ageToYears); display uses the
 * unit the user entered.
 */

export type AgeUnit = "years" | "months" | "days";

export const AGE_UNITS: { value: AgeUnit; label: string }[] = [
  { value: "years", label: "سنة" },
  { value: "months", label: "شهر" },
  { value: "days", label: "يوم" },
];

/** Inclusive limits per unit. Beyond them the next unit up should be used. */
export const AGE_LIMITS: Record<AgeUnit, { min: number; max: number }> = {
  years: { min: 1, max: 130 },
  months: { min: 1, max: 47 },
  days: { min: 1, max: 90 },
};

export const DAYS_PER_YEAR = 365.25;

export function parseAgeUnit(value: unknown): AgeUnit {
  return value === "months" || value === "days" ? value : "years";
}

export function isValidAge(age: number, unit: AgeUnit): boolean {
  const { min, max } = AGE_LIMITS[unit];
  return Number.isInteger(age) && age >= min && age <= max;
}

/** Why an age is not acceptable, in words the user can act on. */
export function ageProblem(age: number, unit: AgeUnit): string | null {
  if (isValidAge(age, unit)) return null;
  const { min, max } = AGE_LIMITS[unit];
  const noun = unit === "years" ? "بالسنوات" : unit === "months" ? "بالشهور" : "بالأيام";
  return `اكتب السن ${noun} (من ${min} إلى ${max})`;
}

/**
 * Age in fractional years — what reference ranges are compared against.
 * undefined stays undefined so "age unknown" is not mistaken for 0.
 */
export function ageToYears(age: number | undefined | null, unit?: AgeUnit | null): number | undefined {
  if (typeof age !== "number" || !Number.isFinite(age) || age < 0) return undefined;
  if (unit === "months") return age / 12;
  if (unit === "days") return age / DAYS_PER_YEAR;
  return age;
}

/** "سنة" / "سنتان" / "3 سنوات" / "11 سنة" — correct Arabic number agreement. */
function arabicCount(n: number, one: string, two: string, few: string, many: string): string {
  if (n === 1) return one;
  if (n === 2) return two;
  if (n >= 3 && n <= 10) return `${n} ${few}`;
  return `${n} ${many}`;
}

export function formatAge(lang: "ar" | "en", age: number, unit?: AgeUnit | null): string {
  const u = parseAgeUnit(unit);
  if (lang === "en") {
    const noun = u === "years" ? "Year" : u === "months" ? "Month" : "Day";
    return `${age} ${noun}${age === 1 ? "" : "s"}`;
  }
  if (u === "years") return arabicCount(age, "سنة", "سنتان", "سنوات", "سنة");
  if (u === "months") return arabicCount(age, "شهر", "شهران", "أشهر", "شهرًا");
  return arabicCount(age, "يوم", "يومان", "أيام", "يومًا");
}
