import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { applyPendingRestore, findDataRoot, pendingRestorePath, stamp } from "./hub-restore.mjs";

function setup() {
  const home = mkdtempSync(join(tmpdir(), "hub-restore-"));
  mkdirSync(join(home, "db"), { recursive: true });
  writeFileSync(join(home, "db", "PG_VERSION"), "old");
  mkdirSync(join(home, "restore"), { recursive: true });
  writeFileSync(pendingRestorePath(home), "gz-bytes");
  return home;
}
const fakeExtract = (layout) => (archive, dest) => {
  assert.equal(readFileSync(archive, "utf8"), "gz-bytes");
  let dir = dest;
  for (const part of layout) { dir = join(dir, part); mkdirSync(dir, { recursive: true }); }
  writeFileSync(join(dir, "PG_VERSION"), "new");
};

test("nothing pending: nothing happens", () => {
  const home = setup();
  rmSync(pendingRestorePath(home));
  assert.deepEqual(applyPendingRestore(home), { applied: false });
  assert.equal(readFileSync(join(home, "db", "PG_VERSION"), "utf8"), "old");
});

test("restore replaces the data and keeps the old one next to it", () => {
  const home = setup();
  const r = applyPendingRestore(home, { extract: fakeExtract([]), now: new Date(2026, 9, 8, 14, 5, 9) });
  assert.equal(r.applied, true);
  assert.equal(readFileSync(join(home, "db", "PG_VERSION"), "utf8"), "new");
  assert.match(r.safetyCopy, /db\.before-restore-20261008-140509$/);
  assert.equal(readFileSync(join(r.safetyCopy, "PG_VERSION"), "utf8"), "old");
  assert.equal(existsSync(pendingRestorePath(home)), false);
  assert.equal(existsSync(join(home, "db.restoring")), false);
});

test("an archive that wraps the data in folders still restores", () => {
  const home = setup();
  assert.equal(applyPendingRestore(home, { extract: fakeExtract(["pglite", "data"]) }).applied, true);
  assert.equal(readFileSync(join(home, "db", "PG_VERSION"), "utf8"), "new");
});

test("a file that is not a backup is refused and the current data is untouched", () => {
  const home = setup();
  const r = applyPendingRestore(home, { extract: (_a, dest) => writeFileSync(join(dest, "random.txt"), "x") });
  assert.equal(r.applied, false);
  assert.match(r.error, /not a Microscopic backup/);
  assert.equal(readFileSync(join(home, "db", "PG_VERSION"), "utf8"), "old");
  assert.equal(existsSync(pendingRestorePath(home)), false); // not retried on every start
  assert.equal(existsSync(`${pendingRestorePath(home)}.failed`), true);
  assert.equal(existsSync(join(home, "db.restoring")), false);
});

test("an extraction error is refused the same way", () => {
  const home = setup();
  const r = applyPendingRestore(home, { extract: () => { throw new Error("tar failed: boom"); } });
  assert.equal(r.applied, false);
  assert.match(r.error, /boom/);
  assert.equal(readFileSync(join(home, "db", "PG_VERSION"), "utf8"), "old");
});

test("first install with no db folder yet", () => {
  const home = setup();
  rmSync(join(home, "db"), { recursive: true });
  const r = applyPendingRestore(home, { extract: fakeExtract([]) });
  assert.deepEqual([r.applied, r.safetyCopy], [true, null]);
  assert.deepEqual(readdirSync(home).sort(), ["db", "restore"]);
});

test("findDataRoot and stamp", () => {
  const dir = mkdtempSync(join(tmpdir(), "root-"));
  assert.equal(findDataRoot(dir), null);
  mkdirSync(join(dir, "a", "b"), { recursive: true });
  writeFileSync(join(dir, "a", "b", "PG_VERSION"), "x");
  assert.equal(findDataRoot(dir), join(dir, "a", "b"));
  assert.equal(stamp(new Date(2026, 0, 2, 3, 4, 5)), "20260102-030405");
});
