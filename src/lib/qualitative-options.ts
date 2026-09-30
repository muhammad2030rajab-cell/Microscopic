/**
 * Pick-lists for descriptive (non-numeric) tests — urine and stool analysis.
 *
 * Keyed by `${categoryId}:${testName}` because the same name ("Color", "Blood")
 * exists in more than one category. No imports, so it is unit-testable with
 * plain node.
 *
 * `abnormal` semantics:
 *   true      -> the option is outside the expected result
 *   false     -> the option is an expected result
 *   undefined -> not decided here (numeric picks such as pH): the numeric
 *                reference-range logic in medical.ts decides.
 *
 * The normal/abnormal split below follows the catalog reference values
 * (e.g. Protein "Negative", Crystals "Few") and should be reviewed by the
 * laboratory director before use.
 */

export interface QualOption {
  value: string;
  abnormal?: boolean;
}

const URINE = "c12";
const STOOL = "c13";

const ok = (...v: string[]): QualOption[] => v.map((value) => ({ value, abnormal: false }));
const bad = (...v: string[]): QualOption[] => v.map((value) => ({ value, abnormal: true }));
const num = (...v: string[]): QualOption[] => v.map((value) => ({ value }));

const GRADE = [...ok("Negative"), ...bad("Trace", "+", "++", "+++")];
const GRADE_4PLUS = [...GRADE, ...bad("++++")];
const BILIRUBIN = [...ok("Negative"), ...bad("+", "++", "+++")];
const POS_NEG = [...ok("Negative"), ...bad("Positive")];
const AMOUNT_FEW_OK = [...ok("Negative", "Few"), ...bad("Moderate", "Many")];
const AMOUNT_NEG_OK = [...ok("Negative"), ...bad("Few", "Moderate", "Many")];

// Cells per high-power field where the reference is "0-2".
const CELLS_0_2 = [
  ...ok("0-1", "1-2", "0-2"),
  ...bad("2-4", "4-6", "6-8", "8-10", "10-15", "15-20", "20-30", "30-50", "Plenty"),
];
// Cells per high-power field where the reference is "0-5".
const CELLS_0_5 = [
  ...ok("0-1", "0-2", "2-4", "3-5", "0-5"),
  ...bad("5-8", "8-10", "10-15", "15-20", "20-30", "30-50", "Plenty"),
];

const range = (from: number, to: number, step: number, digits: number) => {
  const out: string[] = [];
  for (let x = from; x <= to + 1e-9; x += step) out.push(x.toFixed(digits));
  return out;
};

const DEFS: Record<string, QualOption[]> = {
  // ---- Urine analysis -------------------------------------------------
  [`${URINE}:Color`]: [
    ...ok("Pale Yellow", "Straw", "Yellow", "Dark Yellow"),
    ...bad("Amber", "Orange", "Red", "Brown", "Green"),
  ],
  [`${URINE}:Appearance`]: [
    ...ok("Clear"),
    ...bad("Slightly Turbid", "Turbid", "Bloody"),
  ],
  [`${URINE}:Specific Gravity`]: num(...range(1.0, 1.04, 0.005, 3)),
  [`${URINE}:pH`]: num("5", "5.5", "6", "6.5", "7", "7.5", "8", "8.5", "9"),
  [`${URINE}:Protein`]: GRADE,
  [`${URINE}:Glucose`]: GRADE_4PLUS,
  [`${URINE}:Ketones`]: GRADE,
  [`${URINE}:Bilirubin`]: BILIRUBIN,
  [`${URINE}:Blood`]: GRADE,
  [`${URINE}:Leukocytes`]: GRADE,
  [`${URINE}:Nitrite`]: POS_NEG,
  [`${URINE}:Urobilinogen`]: num("0.2", "1", "2", "4", "8"),
  [`${URINE}:RBCs in Urine`]: CELLS_0_2,
  [`${URINE}:WBCs in Urine`]: CELLS_0_5,
  [`${URINE}:Casts`]: [
    ...ok("Nil", "0-2", "2-4"),
    ...bad("5-10", "10-20", "Plenty"),
  ],
  [`${URINE}:Crystals`]: AMOUNT_FEW_OK,
  [`${URINE}:Bacteria`]: AMOUNT_NEG_OK,

  // ---- Stool analysis -------------------------------------------------
  [`${STOOL}:Color`]: [
    ...ok("Brown", "Light Brown", "Dark Brown"),
    ...bad("Yellow", "Green", "Black", "Red", "Clay (Pale)"),
  ],
  [`${STOOL}:Consistency`]: [
    ...ok("Formed", "Semi-formed"),
    ...bad("Soft", "Loose", "Watery", "Hard"),
  ],
  [`${STOOL}:Mucus`]: [...ok("Negative"), ...bad("Few", "Moderate", "Abundant")],
  [`${STOOL}:Blood`]: POS_NEG,
  [`${STOOL}:Pus Cells`]: CELLS_0_2,
  [`${STOOL}:RBCs`]: CELLS_0_2,
  [`${STOOL}:Ova & Parasites`]: [
    ...ok("Negative"),
    ...bad(
      "Entamoeba histolytica (cysts)",
      "Entamoeba histolytica (trophozoites)",
      "Entamoeba coli (cysts)",
      "Giardia lamblia (cysts)",
      "Giardia lamblia (trophozoites)",
      "Blastocystis hominis",
      "Ascaris lumbricoides (ova)",
      "Trichuris trichiura (ova)",
      "Hymenolepis nana (ova)",
      "Taenia species (ova)",
      "Schistosoma mansoni (ova)",
      "Ancylostoma duodenale (ova)",
      "Strongyloides stercoralis (larvae)",
    ),
  ],
  [`${STOOL}:Fat Globules`]: AMOUNT_FEW_OK,
  [`${STOOL}:Undigested Food`]: AMOUNT_FEW_OK,
  [`${STOOL}:Occult Blood`]: POS_NEG,
};

/**
 * The "everything normal" preset used by the fill-normals button. Only tests
 * with an unambiguous normal option are listed; numeric picks (specific
 * gravity, pH, urobilinogen) are left for the technician to read off.
 * Every value here must be an option with abnormal === false (unit-tested).
 */
const NORMAL_DEFAULTS: Record<string, string> = {
  [`${URINE}:Color`]: "Yellow",
  [`${URINE}:Appearance`]: "Clear",
  [`${URINE}:Protein`]: "Negative",
  [`${URINE}:Glucose`]: "Negative",
  [`${URINE}:Ketones`]: "Negative",
  [`${URINE}:Bilirubin`]: "Negative",
  [`${URINE}:Blood`]: "Negative",
  [`${URINE}:Leukocytes`]: "Negative",
  [`${URINE}:Nitrite`]: "Negative",
  [`${URINE}:RBCs in Urine`]: "0-2",
  [`${URINE}:WBCs in Urine`]: "0-2",
  [`${URINE}:Casts`]: "Nil",
  [`${URINE}:Crystals`]: "Negative",
  [`${URINE}:Bacteria`]: "Negative",
  [`${STOOL}:Color`]: "Brown",
  [`${STOOL}:Consistency`]: "Formed",
  [`${STOOL}:Mucus`]: "Negative",
  [`${STOOL}:Blood`]: "Negative",
  [`${STOOL}:Pus Cells`]: "0-2",
  [`${STOOL}:RBCs`]: "0-2",
  [`${STOOL}:Ova & Parasites`]: "Negative",
  [`${STOOL}:Fat Globules`]: "Negative",
  [`${STOOL}:Undigested Food`]: "Negative",
  [`${STOOL}:Occult Blood`]: "Negative",
};

/** The preset normal value for a test, or null if it has none. */
export function getNormalDefault(categoryId: string | undefined, testName: string): string | null {
  if (!categoryId) return null;
  return NORMAL_DEFAULTS[`${categoryId}:${testName}`] ?? null;
}

/** Options for a test, or null when it should be a free-entry field. */
export function getQualitativeOptions(
  categoryId: string | undefined,
  testName: string,
): QualOption[] | null {
  if (!categoryId) return null;
  return DEFS[`${categoryId}:${testName}`] ?? null;
}

/**
 * "normal" / "abnormal" when the value is one of the listed options and the
 * option carries an explicit verdict; null when it cannot be decided here.
 */
export function qualitativeVerdict(
  categoryId: string | undefined,
  testName: string,
  value: string,
): "normal" | "abnormal" | null {
  const options = getQualitativeOptions(categoryId, testName);
  if (!options) return null;
  const v = value.trim().toLowerCase();
  const hit = options.find((o) => o.value.toLowerCase() === v);
  if (!hit || hit.abnormal === undefined) return null;
  return hit.abnormal ? "abnormal" : "normal";
}
