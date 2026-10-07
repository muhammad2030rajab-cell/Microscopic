import assert from "node:assert/strict";
import { test } from "node:test";

// UMD file for the offline page; under this package's "type": "module" it registers on globalThis.
await import("../public/offline-archive.js");
const A = globalThis.OfflineArchive;
const DAY = 86400000;

test("freshness: recent copy shows, old / missing / future timestamps do not", () => {
  const now = 1_000_000_000_000;
  assert.equal(A.isFresh(now - 1 * DAY, now), true);
  assert.equal(A.isFresh(now - 90 * DAY, now), true);
  assert.equal(A.isFresh(now - 90 * DAY - 1, now), false);
  assert.equal(A.isFresh(undefined, now), false);
  assert.equal(A.isFresh(0, now), false);
  assert.equal(A.isFresh(NaN, now), false);
  assert.equal(A.isFresh(now + DAY, now), false);
  assert.equal(A.isFresh(now - 20 * DAY, now, 30), true);
});

test("search folds Arabic spelling, digits and case", () => {
  assert.equal(A.matches("احمد", ["أحمد علي"]), true);
  assert.equal(A.matches("فاطمه", ["فاطمة"]), true);
  assert.equal(A.matches("مني", ["منى"]), true);
  assert.equal(A.matches("٠١٠١٢", ["01012345678"]), true);
  assert.equal(A.matches("ALI", ["ali hassan"]), true);
  assert.equal(A.matches("علي احمد", ["أحمد محمد علي"]), true); // any order
  assert.equal(A.matches("خالد", ["أحمد علي"]), false);
  assert.equal(A.matches("", ["x"]), true);
  assert.equal(A.matches("   ", []), true);
});

test("ages, statuses and flags have safe fallbacks", () => {
  assert.equal(A.ageText(25, "years"), "25 سنة");
  assert.equal(A.ageText(3, "months"), "3 شهر");
  assert.equal(A.ageText(10, "days"), "10 يوم");
  assert.equal(A.ageText("x", "weird"), "0 سنة");
  assert.equal(A.statusText("approved"), "معتمد");
  assert.equal(A.statusText("???"), "مسودة");
  assert.equal(A.flagInfo("normal").text, "");
  assert.equal(A.flagInfo("high").cls, "hi");
  assert.equal(A.flagInfo("low").cls, "lo");
  assert.equal(A.flagInfo("critical").cls, "cr");
  assert.notEqual(A.flagInfo("something-new").text, ""); // unknown never shows as normal
});

test("list: newest first, own lab only, orphan reports skipped", () => {
  const patients = [
    { id: "p1", lab_id: "L1", full_name: "منى", age: 25, age_unit: "years", gender: "أنثى" },
    { id: "p2", lab_id: "L2", full_name: "غريب", age: 40, gender: "ذكر" },
  ];
  const reports = [
    { id: "a", lab_id: "L1", patient_id: "p1", created_at: "2026-10-01T10:00:00Z", status: "approved" },
    { id: "b", lab_id: "L1", patient_id: "p1", created_at: "2026-10-02T10:00:00Z", status: "draft" },
    { id: "c", lab_id: "L1", patient_id: "gone", created_at: "2026-10-03T10:00:00Z" },
    { id: "d", lab_id: "L2", patient_id: "p2", created_at: "2026-10-04T10:00:00Z" },
  ];
  const out = A.buildList(reports, patients, "L1");
  assert.deepEqual(out.map((r) => r.id), ["b", "a"]);
  assert.equal(out[0].doctor, "Himself");
  assert.equal(out[1].age, "25 سنة");
});
