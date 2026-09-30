/**
 * Numbers typed on an Arabic keyboard: ٣٥, ٥٫٢ (Arabic decimal separator),
 * or 5,2 (decimal comma). Pure, no imports.
 *
 * JavaScript's \d only matches 0-9, so without this a result typed as "٥.٢"
 * was silently not recognised (no flag), and an age typed as "٣٥" was erased.
 */

const EASTERN_ARABIC = "٠١٢٣٤٥٦٧٨٩";
const PERSIAN = "۰۱۲۳۴۵۶۷۸۹";

/** Digits → 0-9, Arabic decimal separator → ".", Arabic thousands → ",". Nothing else changes. */
export function normalizeNumerals(text: string): string {
  return text
    .replace(/[٠-٩]/g, (d) => String(EASTERN_ARABIC.indexOf(d)))
    .replace(/[۰-۹]/g, (d) => String(PERSIAN.indexOf(d)))
    .replace(/٫/g, ".")
    .replace(/٬/g, ",");
}

/**
 * Prepare text for number extraction. A comma followed by exactly three digits
 * is a thousands separator ("1,200" → 1200); any other comma between digits is
 * a decimal comma ("5,2" → 5.2, "0,85" → 0.85).
 */
export function toNumberText(text: string): string {
  const t = normalizeNumerals(text);
  return t
    .replace(/(\d),(?=\d{3}(?!\d))/g, "$1") // thousands
    .replace(/(\d),(?=\d)/g, "$1."); // decimal comma
}
