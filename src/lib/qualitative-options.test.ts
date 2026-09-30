import test from "node:test";
import assert from "node:assert/strict";
import { getNormalDefault, getQualitativeOptions, qualitativeVerdict } from "./qualitative-options.ts";

test("same test name resolves per category", () => {
  const urine = getQualitativeOptions("c12", "Color")!.map((o) => o.value);
  const stool = getQualitativeOptions("c13", "Color")!.map((o) => o.value);
  assert.ok(urine.includes("Yellow") && !urine.includes("Black"));
  assert.ok(stool.includes("Black") && stool.includes("Clay (Pale)"));
});

test("no category means no options (avoids name collisions)", () => {
  assert.equal(getQualitativeOptions(undefined, "Color"), null);
  assert.equal(getQualitativeOptions("c3", "RBCs"), null);
});

test("urine yellow is normal, urine red is abnormal", () => {
  assert.equal(qualitativeVerdict("c12", "Color", "Yellow"), "normal");
  assert.equal(qualitativeVerdict("c12", "Color", "Pale Yellow"), "normal");
  assert.equal(qualitativeVerdict("c12", "Color", "Red"), "abnormal");
});

test("dipstick grades: only Negative is normal", () => {
  assert.equal(qualitativeVerdict("c12", "Protein", "Negative"), "normal");
  assert.equal(qualitativeVerdict("c12", "Protein", "Trace"), "abnormal");
  assert.equal(qualitativeVerdict("c12", "Protein", "+++"), "abnormal");
});

test("cell counts: 2-4 exceeds a 0-2 reference", () => {
  assert.equal(qualitativeVerdict("c12", "RBCs in Urine", "0-2"), "normal");
  assert.equal(qualitativeVerdict("c12", "RBCs in Urine", "2-4"), "abnormal");
  assert.equal(qualitativeVerdict("c13", "RBCs", "Plenty"), "abnormal");
});

test("numeric picks are left to the numeric range logic", () => {
  assert.equal(qualitativeVerdict("c12", "pH", "6"), null);
  assert.equal(qualitativeVerdict("c12", "Specific Gravity", "1.020"), null);
  const sg = getQualitativeOptions("c12", "Specific Gravity")!.map((o) => o.value);
  assert.equal(sg[0], "1.000");
  assert.equal(sg[sg.length - 1], "1.040");
  assert.equal(sg.length, 9);
});

test("values outside the list are undecided (free-text fallback)", () => {
  assert.equal(qualitativeVerdict("c13", "Ova & Parasites", "Something else"), null);
});

test("parasite findings are abnormal, Negative is normal", () => {
  assert.equal(qualitativeVerdict("c13", "Ova & Parasites", "Negative"), "normal");
  assert.equal(qualitativeVerdict("c13", "Ova & Parasites", "Giardia lamblia (cysts)"), "abnormal");
});

test("every catalog test in urine and stool has options", () => {
  const urine = ["Color","Appearance","Specific Gravity","pH","Protein","Glucose","Ketones","Bilirubin","Blood","Leukocytes","Nitrite","Urobilinogen","RBCs in Urine","WBCs in Urine","Casts","Crystals","Bacteria"];
  const stool = ["Color","Consistency","Mucus","Blood","Pus Cells","RBCs","Ova & Parasites","Fat Globules","Undigested Food","Occult Blood"];
  for (const n of urine) assert.ok(getQualitativeOptions("c12", n), `c12 ${n}`);
  for (const n of stool) assert.ok(getQualitativeOptions("c13", n), `c13 ${n}`);
});

test("every normal default is a listed option that is judged normal", () => {
  const urine = ["Color","Appearance","Protein","Glucose","Ketones","Bilirubin","Blood","Leukocytes","Nitrite","RBCs in Urine","WBCs in Urine","Casts","Crystals","Bacteria"];
  const stool = ["Color","Consistency","Mucus","Blood","Pus Cells","RBCs","Ova & Parasites","Fat Globules","Undigested Food","Occult Blood"];
  for (const [cat, names] of [["c12", urine], ["c13", stool]] as const) {
    for (const n of names) {
      const d = getNormalDefault(cat, n);
      if (d === null) throw new Error(`${cat} ${n} has no default`);
      assert.equal(qualitativeVerdict(cat, n, d), "normal", `${cat} ${n} = ${d}`);
    }
  }
});

test("numeric picks and non-pick-list tests have no preset", () => {
  assert.equal(getNormalDefault("c12", "Specific Gravity"), null);
  assert.equal(getNormalDefault("c12", "pH"), null);
  assert.equal(getNormalDefault("c12", "Urobilinogen"), null);
  assert.equal(getNormalDefault("c3", "RBCs"), null);
  assert.equal(getNormalDefault(undefined, "Color"), null);
});
