/**
 * Age-specific reference ranges, written by the lab in plain text — one line
 * per band, on the catalog page. No medical values are built in: the lab
 * enters the ranges of its own method / kit insert.
 *
 * Line format (age in whole years, upper bound EXCLUSIVE):
 *
 *     1-12: 11.5-15.5             children from 1 up to (not incl.) 12
 *     12-18 ذكر: 13.0-16.0        males 12 to 17
 *     12-18 أنثى: 12.0-16.0       females 12 to 17
 *     65+: 12.0-16.5              65 and over
 *
 * The sex word may be ذكر / أنثى / M / F. A band with a sex wins over a band
 * without one for that sex. Anything not covered falls back to the lab's
 * normal male/female range. Pure functions, no imports.
 */

export type Sex = "ذكر" | "أنثى";

export interface AgeBand {
  min: number;
  /** Exclusive. null = no upper limit. */
  max: number | null;
  sex: Sex | null;
  range: string;
}

export type ParseResult = { ok: true; bands: AgeBand[] } | { ok: false; error: string };

const ARABIC_DIGITS = "٠١٢٣٤٥٦٧٨٩";

function normalizeDigits(s: string): string {
  return s
    .replace(/[٠-٩]/g, (d) => String(ARABIC_DIGITS.indexOf(d)))
    .replace(/：/g, ":")
    .replace(/[–—−]/g, "-");
}

function parseSex(token: string): Sex | null | undefined {
  const t = token.trim().toLowerCase();
  if (!t) return null;
  if (t === "ذكر" || t === "m" || t === "male") return "ذكر";
  if (t === "أنثى" || t === "انثى" || t === "f" || t === "female") return "أنثى";
  return undefined; // unrecognised
}

export function parseAgeRanges(text: string | null | undefined): ParseResult {
  const bands: AgeBand[] = [];
  const lines = normalizeDigits(text ?? "").split(/\r?\n/);

  for (let i = 0; i < lines.length; i += 1) {
    const raw = lines[i].trim();
    if (!raw) continue;
    const n = i + 1;

    const colon = raw.indexOf(":");
    if (colon === -1) return { ok: false, error: `سطر ${n}: الصيغة الصحيحة "1-12: 11.5-15.5" (السن ثم نقطتين ثم المدى)` };

    const head = raw.slice(0, colon).trim();
    const range = raw.slice(colon + 1).trim();
    if (!range) return { ok: false, error: `سطر ${n}: اكتب المدى بعد النقطتين` };
    if (range.length > 60) return { ok: false, error: `سطر ${n}: المدى طويل جدًا` };

    const m = head.match(/^(\d+)\s*(?:(\+)|-\s*(\d+))\s*(.*)$/);
    if (!m) return { ok: false, error: `سطر ${n}: السن يُكتب "1-12" أو "65+" (بالسنوات)` };

    const min = Number(m[1]);
    const max = m[2] ? null : Number(m[3]);
    if (max !== null && !(max > min)) return { ok: false, error: `سطر ${n}: الحد الأعلى يجب أن يكون أكبر من الأدنى` };
    if (min > 130 || (max !== null && max > 130)) return { ok: false, error: `سطر ${n}: السن غير منطقي` };

    const sex = parseSex(m[4]);
    if (sex === undefined) return { ok: false, error: `سطر ${n}: النوع "${m[4].trim()}" غير مفهوم — استخدم ذكر أو أنثى` };

    bands.push({ min, max, sex, range });
  }

  // Overlap check, separately per sex group ("any" overlaps with everything of the same group only).
  for (const group of [null, "ذكر", "أنثى"] as const) {
    const g = bands.filter((b) => b.sex === group).sort((a, b) => a.min - b.min);
    for (let i = 1; i < g.length; i += 1) {
      const prev = g[i - 1];
      if (prev.max === null || g[i].min < prev.max) {
        const label = group ?? "";
        return {
          ok: false,
          error: `نطاقان متداخلان${label ? ` (${label})` : ""}: ${prev.min}${prev.max === null ? "+" : `-${prev.max}`} و ${g[i].min}${g[i].max === null ? "+" : `-${g[i].max}`}`,
        };
      }
    }
  }

  return { ok: true, bands: bands.sort((a, b) => a.min - b.min) };
}

/** The range for this age and sex, or null when no band applies. */
export function pickAgeRange(bands: AgeBand[], age: number, sex: Sex): string | null {
  if (!Number.isFinite(age) || age < 0) return null;
  const inBand = (b: AgeBand) => age >= b.min && (b.max === null || age < b.max);
  const specific = bands.find((b) => b.sex === sex && inBand(b));
  if (specific) return specific.range;
  const generic = bands.find((b) => b.sex === null && inBand(b));
  return generic ? generic.range : null;
}

export interface CatalogRanges {
  male_range?: string | null;
  female_range?: string | null;
  age_ranges?: string | null;
}

export interface BuiltinRanges {
  /** The built-in adult range for this sex (what a freshly seeded catalog row holds). */
  sexDefault?: string;
  /** A built-in age-band range for this age, if the app ships one for the test. */
  ageRange?: string;
}

const same = (a: string | undefined, b: string | undefined) =>
  (a ?? "").trim().toLowerCase() === (b ?? "").trim().toLowerCase();

/**
 * The reference range that applies to a patient, in order:
 *   1. the lab's own age band for this age and sex
 *   2. the lab's male/female range, if the lab changed it from the built-in one
 *   3. a built-in age band (only when the lab has not customised the range)
 *   4. the lab's male/female range
 * undefined means "no catalog row": the caller falls back to getNormalRange().
 * A malformed age_ranges text is ignored rather than breaking the report.
 */
export function effectiveCatalogRange(
  row: CatalogRanges | undefined,
  sex: Sex,
  age: number,
  builtin?: BuiltinRanges,
): string | undefined {
  if (!row) return undefined;
  const parsed = parseAgeRanges(row.age_ranges);
  if (parsed.ok && parsed.bands.length) {
    const hit = pickAgeRange(parsed.bands, age, sex);
    if (hit) return hit;
  }
  const bySex = (sex === "ذكر" ? row.male_range : row.female_range)?.trim() || undefined;
  if (builtin?.ageRange && (!bySex || same(bySex, builtin.sexDefault))) return builtin.ageRange;
  return bySex;
}
