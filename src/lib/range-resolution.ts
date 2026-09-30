import { effectiveCatalogRange, type CatalogRanges, type Sex } from "./age-ranges";
import { getBuiltinAgeRange, getNormalRange } from "./tests-catalog";

/**
 * The reference range that applies to one test for one patient. Precedence:
 *   1. the lab's own age bands (catalog page)
 *   2. the lab's male/female range, when the lab has customised it
 *   3. the built-in age band (starter values in tests-catalog.ts)
 *   4. the lab's male/female range (still the built-in adult default)
 * Returns undefined when the lab has no row for the test; callers then fall
 * back to getNormalRange().
 */
export function resolveRange(
  row: CatalogRanges | undefined,
  test: { name: string; categoryId: string },
  sex: Sex,
  age: number,
): string | undefined {
  return effectiveCatalogRange(row, sex, age, {
    sexDefault: getNormalRange(test.name, sex, undefined, test.categoryId),
    ageRange: getBuiltinAgeRange(test.name, sex, age),
  });
}
