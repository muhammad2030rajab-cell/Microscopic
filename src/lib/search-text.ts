/**
 * Search folding for Arabic text. Pure, no imports.
 *
 * Without it, typing "احمد" does not find "أحمد", "منى" does not find "منىٰ"
 * or "منة"/"منه" don't match each other, and Arabic-keyboard digits never
 * match Latin-digit codes. Both sides (the query and the searched text) must
 * go through the same fold. The SQL side uses translate() with the same
 * character lists, exported below so the two cannot drift apart.
 */

/** Characters folded to one letter each: أ إ آ → ا, ى → ي, ة → ه. Same order as SQL_FOLD_TO. */
export const SQL_FOLD_FROM = "أإآىة";
export const SQL_FOLD_TO = "ااايه";

const TASHKEEL_AND_TATWEEL = /[\u064B-\u0652\u0670\u0640]/g;
const EASTERN = "٠١٢٣٤٥٦٧٨٩";

export function normalizeSearch(text: string): string {
  let out = text
    .replace(TASHKEEL_AND_TATWEEL, "")
    .replace(/[٠-٩]/g, (d) => String(EASTERN.indexOf(d)))
    .toLowerCase();
  for (let i = 0; i < SQL_FOLD_FROM.length; i += 1) {
    out = out.split(SQL_FOLD_FROM[i]).join(SQL_FOLD_TO[i]);
  }
  return out.replace(/\s+/g, " ").trim();
}

/** True when every word of the query appears somewhere in the haystack (order-free). */
export function matchesSearch(query: string, ...fields: (string | undefined | null)[]): boolean {
  const words = normalizeSearch(query).split(" ").filter(Boolean);
  if (!words.length) return true;
  const hay = normalizeSearch(fields.filter(Boolean).join(" "));
  return words.every((w) => hay.includes(w));
}

/** Escape LIKE/ILIKE wildcards so a typed % or _ is searched literally. */
export function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, (c) => `\\${c}`);
}
