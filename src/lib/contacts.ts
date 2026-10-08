import { createServerFn } from "@tanstack/react-start";
import { randomUUID } from "node:crypto";
import { authMiddleware } from "@/lib/auth/middleware";
import { logAudit } from "@/lib/audit";
import { requireLabPermission } from "@/lib/lab-users";

/**
 * Referring doctors and clients of the lab. Viewing needs "patients.view", adding/editing "patients.edit",
 * deleting "patients.delete" (the owner has all of them implicitly).
 */

export type ContactKind = "doctor" | "client";
export type Contact = {
  id: string;
  kind: ContactKind;
  name: string;
  specialty: string | null;
  phone: string | null;
  notes: string | null;
  isActive: boolean;
};

type Row = {
  id: string;
  kind: ContactKind;
  name: string;
  specialty: string | null;
  phone: string | null;
  notes: string | null;
  is_active: boolean;
};

const toContact = (r: Row): Contact => ({
  id: r.id,
  kind: r.kind,
  name: r.name,
  specialty: r.specialty,
  phone: r.phone,
  notes: r.notes,
  isActive: r.is_active,
});

function text(value: unknown, max: number): string | null {
  const v = typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
  if (!v) return null;
  if (v.length > max) throw new Error(`النص أطول من ${max} حرف`);
  return v;
}

function clean(data: { kind?: string; name?: string; specialty?: string | null; phone?: string | null; notes?: string | null }) {
  if (data.kind !== "doctor" && data.kind !== "client") throw new Error("النوع غير صحيح");
  const name = text(data.name, 120);
  if (!name || name.length < 2) throw new Error("الاسم قصير جدًا");
  const phone = text(data.phone, 30);
  if (phone && !/^[0-9+\-\s()]{6,30}$/.test(phone)) throw new Error("رقم الهاتف غير صحيح");
  return { kind: data.kind as ContactKind, name, specialty: text(data.specialty, 120), phone, notes: text(data.notes, 500) };
}

export const listContacts = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<{ contacts: Contact[]; canEdit: boolean; canDelete: boolean }> => {
    const ctx = await requireLabPermission(context.userId, "patients.view");
    const rows = await ctx.sql<Row>`
      select id, kind, name, specialty, phone, notes, is_active
      from lab_contacts where lab_id = ${ctx.labId} order by kind, name
    `;
    return {
      contacts: rows.map(toContact),
      canEdit: ctx.role === "owner" || ctx.permissions["patients.edit"] === true,
      canDelete: ctx.role === "owner" || ctx.permissions["patients.delete"] === true,
    };
  });

export const createContact = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context, data }: { context: { userId: string }; data: { kind: string; name: string; specialty?: string | null; phone?: string | null; notes?: string | null } }) => {
    const { sql, labId, labUserId } = await requireLabPermission(context.userId, "patients.edit");
    const c = clean(data);
    const id = randomUUID();
    await sql.query(
      `insert into lab_contacts (id, lab_id, kind, name, specialty, phone, notes) values ($1,$2,$3,$4,$5,$6,$7)`,
      [id, labId, c.kind, c.name, c.specialty, c.phone, c.notes],
    );
    await logAudit(sql, { labId, actorUserId: labUserId, actorAuthUserId: context.userId, action: "contact.created", entityType: "contact", entityId: id });
    return { id };
  });

export const updateContact = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context, data }: { context: { userId: string }; data: { id: string; kind: string; name: string; specialty?: string | null; phone?: string | null; notes?: string | null; isActive?: boolean } }) => {
    const { sql, labId, labUserId } = await requireLabPermission(context.userId, "patients.edit");
    const c = clean(data);
    const rows = await sql<{ id: string }>`
      update lab_contacts
      set kind = ${c.kind}, name = ${c.name}, specialty = ${c.specialty}, phone = ${c.phone}, notes = ${c.notes},
          is_active = coalesce(${typeof data.isActive === "boolean" ? data.isActive : null}::boolean, is_active),
          updated_at = now()
      where id = ${data.id} and lab_id = ${labId}
      returning id
    `;
    if (!rows.length) throw new Error("غير موجود");
    await logAudit(sql, { labId, actorUserId: labUserId, actorAuthUserId: context.userId, action: "contact.updated", entityType: "contact", entityId: data.id });
    return { id: data.id };
  });

export const deleteContact = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context, data }: { context: { userId: string }; data: { id: string } }) => {
    const { sql, labId, labUserId } = await requireLabPermission(context.userId, "patients.delete");
    await sql.query(`delete from lab_contacts where id = $1 and lab_id = $2`, [data.id, labId]);
    await logAudit(sql, { labId, actorUserId: labUserId, actorAuthUserId: context.userId, action: "contact.deleted", entityType: "contact", entityId: data.id });
    return { id: data.id };
  });
