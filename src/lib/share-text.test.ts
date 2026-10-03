import test from "node:test";
import assert from "node:assert/strict";
import { buildShareMessage, mailtoUrl, whatsappUrl, type ShareInput } from "./share-text.ts";

const base: ShareInput = {
  mode: "link",
  labName: "معمل رجب",
  patientName: "أحمد حسن",
  age: "52 سنة",
  gender: "ذكر",
  doctor: "د. سمير",
  tests: [
    { name: "ALT", value: "80", unit: "U/L" },
    { name: "Notes", value: "  ", unit: "" },
  ],
  critical: [{ name: "K", value: "7.1" }],
  verifyUrl: "https://app.example/verify/abc",
  approved: true,
};

test("link mode never contains the patient name or any result", () => {
  const m = buildShareMessage(base);
  assert.ok(!m.body.includes("أحمد") && !m.subject.includes("أحمد"));
  assert.ok(!m.body.includes("ALT") && !m.body.includes("80"));
  assert.ok(m.body.includes("https://app.example/verify/abc"));
});

test("link mode omits the link until the report is approved", () => {
  const m = buildShareMessage({ ...base, approved: false });
  assert.ok(!m.body.includes("verify"));
});

test("results mode lists entered tests only, with units and critical values", () => {
  const m = buildShareMessage({ ...base, mode: "results" });
  assert.ok(m.body.includes("المريض: أحمد حسن (52 سنة · ذكر)"));
  assert.ok(m.body.includes("ALT: 80 U/L"));
  assert.ok(!m.body.includes("Notes"));
  assert.ok(m.body.includes("قيم حرجة: K (7.1)"));
  assert.ok(m.body.endsWith("https://app.example/verify/abc"));
});

test("urls are encoded", () => {
  const m = buildShareMessage({ ...base, mode: "results" });
  assert.ok(whatsappUrl(m).startsWith("https://wa.me/?text=%D8"));
  assert.ok(mailtoUrl(m).includes("subject=") && mailtoUrl(m).includes("&body="));
  assert.ok(!whatsappUrl(m).includes(" ") && !whatsappUrl(m).includes("\n"));
});

test("whatsapp url targets the patient's number when there is one", () => {
  const m = buildShareMessage(base);
  assert.ok(whatsappUrl(m, "201012345678").startsWith("https://wa.me/201012345678?text="));
  assert.ok(whatsappUrl(m, null).startsWith("https://wa.me/?text="));
  assert.ok(whatsappUrl(m).startsWith("https://wa.me/?text="));
});
