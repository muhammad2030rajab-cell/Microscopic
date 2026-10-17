/**
 * Builds the outbox item for an offline edit of a draft report. Pure.
 *
 * One pending item per report: editing again REPLACES the content of the one
 * that has not been sent, keeping its id (the id is the server's idempotency
 * key — see reconcileWithApplied) and its original base version.
 */
import type { OutboxItem } from "./engine.ts";

export function buildEditItem(
  existing: OutboxItem | undefined,
  input: { labId: string; reportId: string; baseVersion: number; payload: unknown; now: string; newId: string; entity?: "reports" | "lab_test_catalog" },
): OutboxItem {
  // Only an unsent item may be rewritten. A conflict/rejected one needs a person first (see queueReportEdit).
  if (existing && existing.status === "pending") return { ...existing, payload: input.payload };
  return {
    id: input.newId,
    labId: input.labId,
    entity: input.entity ?? "reports",
    entityId: input.reportId,
    op: "upsert",
    baseVersion: input.baseVersion,
    payload: input.payload,
    createdAt: input.now,
    status: "pending",
    attempts: 0,
  };
}

/** The report's items in the outbox: the unsent one, and any that the server refused. */
export function outboxStateFor(items: OutboxItem[], reportId: string, entity: "reports" | "lab_test_catalog" = "reports"): { pending?: OutboxItem; blocked?: OutboxItem } {
  const mine = items.filter((i) => i.entity === entity && i.entityId === reportId);
  return { pending: mine.find((i) => i.status === "pending"), blocked: mine.find((i) => i.status !== "pending") };
}

/** What the "new patient" form sends (same shape as the online CreatePatientInput). */
export type NewPatientPayload = {
  fullName: string;
  patientCode?: string;
  age: number;
  ageUnit?: string;
  gender: "ذكر" | "أنثى";
  phone?: string;
  nationalId?: string;
  notes?: string;
};

/**
 * The outbox item for a patient added with no connection. `id` is both the outbox key and the server's
 * idempotency key (`patients.client_request_id`); it also stands in as the patient's id on this device
 * until the server gives the real one. Pure.
 */
export function buildPatientCreateItem(input: { labId: string; payload: NewPatientPayload; now: string; newId: string }): OutboxItem {
  return {
    id: input.newId,
    labId: input.labId,
    entity: "patients",
    entityId: input.newId,
    op: "upsert",
    baseVersion: null,
    payload: input.payload,
    createdAt: input.now,
    status: "pending",
    attempts: 0,
  };
}

/**
 * Patients added on this device and not sent yet, shaped like pulled `patients` rows so the offline search
 * can list them next to the synced ones. Once the server accepts one, the item leaves the outbox and the
 * next pull brings the real row, so a patient never shows twice. Refused ones are not patients: they wait
 * on the review screen instead.
 */
export function pendingPatientRows(items: OutboxItem[], labId: string): Record<string, unknown>[] {
  return items
    .filter((i) => i.entity === "patients" && i.op === "upsert" && i.baseVersion === null && i.status === "pending" && i.labId === labId)
    .map((i) => {
      const p = (i.payload ?? {}) as Partial<NewPatientPayload>;
      return {
        id: i.entityId,
        lab_id: i.labId,
        patient_code: p.patientCode ? String(p.patientCode).trim().toUpperCase() : null,
        full_name: String(p.fullName ?? "").trim(),
        age: Number(p.age ?? 0),
        age_unit: p.ageUnit ?? null,
        gender: p.gender ?? "ذكر",
        phone: p.phone ? String(p.phone).replace(/\D/g, "") : null,
        national_id: p.nationalId?.trim() || null,
        notes: p.notes?.trim() || null,
        created_at: i.createdAt,
      };
    });
}

/** What the catalog screen sends when a test is saved (same shape as the online CatalogItemEdit, plus the name for the review screen). */
export type CatalogEditPayload = {
  unit: string;
  maleRange: string;
  femaleRange: string;
  ageRanges?: string | null;
  isActive: boolean;
  testName?: string;
};

/**
 * Catalog rows with the edits saved on this device and not sent yet laid on top, so a test shows what the
 * person saved even before the server has it. Refused edits are not applied: they wait on the review screen.
 */
export function overlayCatalogEdits(rows: Record<string, unknown>[], items: OutboxItem[], labId: string): Record<string, unknown>[] {
  const pending = new Map<string, CatalogEditPayload>();
  for (const i of items) {
    if (i.entity === "lab_test_catalog" && i.op === "upsert" && i.status === "pending" && i.labId === labId) pending.set(i.entityId, (i.payload ?? {}) as CatalogEditPayload);
  }
  if (!pending.size) return rows;
  return rows.map((r) => {
    const e = pending.get(String(r.id));
    if (!e) return r;
    const age = (e.ageRanges ?? "").trim();
    return { ...r, unit: e.unit, male_range: e.maleRange, female_range: e.femaleRange, age_ranges: age || null, is_active: Boolean(e.isActive) };
  });
}
