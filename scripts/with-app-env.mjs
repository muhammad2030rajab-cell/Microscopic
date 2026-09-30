// @ts-check
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Absolute path of the project root (the folder that contains `migrations/`
 * and `scripts/`). The script tests import it; it was missing from the
 * source archive, which made `npm test` fail before running anything.
 * @returns {string}
 */
export function projectRoot() {
  return resolve(dirname(fileURLToPath(import.meta.url)), "..");
}
