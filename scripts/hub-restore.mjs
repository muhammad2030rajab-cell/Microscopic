// Applies a backup that the owner uploaded from the program (Settings > Backup), at the next start of the hub.
// The program stages the file at <home>/restore/pending.tar.gz and exits with RESTORE_EXIT_CODE; this runs before
// the database is opened. Safe by design: the new data is unpacked and checked FIRST, and the current data is
// never deleted: it is renamed to db.before-restore-<date> next to it.
import { existsSync, mkdirSync, readdirSync, renameSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

/** Exit code the program uses to ask its launcher (the Windows app) to start it again. */
export const RESTORE_EXIT_CODE = 75;

export const pendingRestorePath = (home) => join(home, "restore", "pending.tar.gz");

/** Unpack a .tar.gz with the system `tar` (Windows 10+ ships tar.exe). */
export function defaultExtract(archive, destDir) {
  const tar = process.platform === "win32" ? join(process.env.SystemRoot || "C:\\Windows", "System32", "tar.exe") : "tar";
  const r = spawnSync(tar, ["-xzf", archive, "-C", destDir], { windowsHide: true, encoding: "utf8" });
  if (r.error || r.status !== 0) throw new Error(`tar failed: ${r.error?.message ?? (r.stderr || r.status)}`);
}

/** The folder that holds PG_VERSION: the unpack root itself, or the single folder(s) inside it (up to 3 deep). */
export function findDataRoot(dir, depth = 3) {
  if (existsSync(join(dir, "PG_VERSION"))) return dir;
  if (depth === 0) return null;
  for (const name of readdirSync(dir)) {
    const sub = join(dir, name);
    if (statSync(sub).isDirectory()) {
      const found = findDataRoot(sub, depth - 1);
      if (found) return found;
    }
  }
  return null;
}

const pad = (n) => String(n).padStart(2, "0");
export const stamp = (d = new Date()) =>
  `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;

export function applyPendingRestore(home, { extract = defaultExtract, now = new Date() } = {}) {
  const archive = pendingRestorePath(home);
  if (!existsSync(archive)) return { applied: false };
  const db = join(home, "db");
  const staging = join(home, "db.restoring");
  rmSync(staging, { recursive: true, force: true });
  mkdirSync(staging, { recursive: true });
  let root;
  try {
    extract(archive, staging);
    root = findDataRoot(staging);
    if (!root) throw new Error("this file is not a Microscopic backup (no database inside)");
  } catch (e) {
    rmSync(staging, { recursive: true, force: true });
    rmSync(`${archive}.failed`, { force: true });
    renameSync(archive, `${archive}.failed`); // do not retry on every start; the current data is untouched
    return { applied: false, error: String(e instanceof Error ? e.message : e) };
  }
  let safetyCopy = null;
  if (existsSync(db)) {
    safetyCopy = join(home, `db.before-restore-${stamp(now)}`);
    renameSync(db, safetyCopy);
  }
  renameSync(root, db);
  rmSync(staging, { recursive: true, force: true });
  rmSync(archive, { force: true });
  return { applied: true, safetyCopy };
}
