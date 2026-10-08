import { createServerFn } from "@tanstack/react-start";
import { randomUUID } from "node:crypto";
import { authMiddleware } from "@/lib/auth/middleware";
import { logAudit } from "@/lib/audit";
import { requireLabPermission } from "@/lib/lab-users";
import { cleanDeviceInput, cleanMoveInput, cleanSupplyInput } from "@/lib/inventory-input";
import type { DeviceStatus } from "@/lib/inventory-math";

/**
 * Lab devices and supplies. Everything needs the "inventory.manage" permission (the owner has it implicitly).
 * Stock changes are single SQL statements (balance + movement row together), so two people working at once
 * can never push a balance below zero or leave a movement without its balance change.
 */

export type Device = {
  id: string;
  name: string;
  model: string | null;
  serialNo: string | null;
  location: string | null;
  status: DeviceStatus;
  purchaseDate: string | null;
  warrantyUntil: string | null;
  lastServiceDate: string | null;
  nextServiceDate: string | null;
  notes: string | null;
};

export type Supply = {
  id: string;
  name: string;
  unit: string | null;
  quantity: number;
  minQuantity: number;
  expiryDate: string | null;
  lotNo: string | null;
  supplier: string | null;
  notes: string | null;
};

export type SupplyMove = { id: string; kind: "in" | "out" | "adjust"; delta: number; note: string | null; createdAt: string };

type DeviceRow = {
  id: string; name: string; model: string | null; serial_no: string | null; location: string | null; status: DeviceStatus;
  purchase_date: string | null; warranty_until: string | null; last_service_date: string | null; next_service_date: string | null; notes: string | null;
};
type SupplyRow = {
  id: string; name: string; unit: string | null; quantity: string | number; min_quantity: string | number;
  expiry_date: string | null; lot_no: string | null; supplier: string | null; notes: string | null;
};

const toDevice = (r: DeviceRow): Device => ({
  id: r.id, name: r.name, model: r.model, serialNo: r.serial_no, location: r.location, status: r.status,
  purchaseDate: r.purchase_date, warrantyUntil: r.warranty_until, lastServiceDate: r.last_service_date,
  nextServiceDate: r.next_service_date, notes: r.notes,
});
const toSupply = (r: SupplyRow): Supply => ({
  id: r.id, name: r.name, unit: r.unit, quantity: Number(r.quantity), minQuantity: Number(r.min_quantity),
  expiryDate: r.expiry_date, lotNo: r.lot_no, supplier: r.supplier, notes: r.notes,
});

const ctx = (userId: string) => requireLabPermission(userId, "inventory.manage");
const audit = (c: Awaited<ReturnType<typeof ctx>>, userId: string, action: string, entityType: string, entityId: string) =>
  logAudit(c.sql, { labId: c.labId, actorUserId: c.labUserId, actorAuthUserId: userId, action, entityType, entityId });

export const listInventory = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<{ devices: Device[]; supplies: Supply[] }> => {
    const { sql, labId } = await ctx(context.userId);
    const devices = await sql<DeviceRow>`
      select id, name, model, serial_no, location, status,
             to_char(purchase_date, 'YYYY-MM-DD') as purchase_date, to_char(warranty_until, 'YYYY-MM-DD') as warranty_until,
             to_char(last_service_date, 'YYYY-MM-DD') as last_service_date, to_char(next_service_date, 'YYYY-MM-DD') as next_service_date,
             notes
      from lab_devices where lab_id = ${labId} order by name
    `;
    const supplies = await sql<SupplyRow>`
      select id, name, unit, quantity, min_quantity, to_char(expiry_date, 'YYYY-MM-DD') as expiry_date, lot_no, supplier, notes
      from lab_supplies where lab_id = ${labId} order by name
    `;
    return { devices: devices.map(toDevice), supplies: supplies.map(toSupply) };
  });

// ───────────────────────── devices ─────────────────────────

export const saveDevice = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context, data }: { context: { userId: string }; data: Record<string, unknown> & { id?: string | null } }) => {
    const c = await ctx(context.userId);
    const d = cleanDeviceInput(data);
    if (data.id) {
      const rows = await c.sql.query<{ id: string }>(
        `update lab_devices set name=$3, model=$4, serial_no=$5, location=$6, status=$7, purchase_date=$8, warranty_until=$9,
           last_service_date=$10, next_service_date=$11, notes=$12, updated_at=now()
         where id=$1 and lab_id=$2 returning id`,
        [data.id, c.labId, d.name, d.model, d.serialNo, d.location, d.status, d.purchaseDate, d.warrantyUntil, d.lastServiceDate, d.nextServiceDate, d.notes],
      );
      if (!rows.length) throw new Error("الجهاز غير موجود");
      await audit(c, context.userId, "device.updated", "device", data.id);
      return { id: data.id };
    }
    const id = randomUUID();
    await c.sql.query(
      `insert into lab_devices (id, lab_id, name, model, serial_no, location, status, purchase_date, warranty_until, last_service_date, next_service_date, notes)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [id, c.labId, d.name, d.model, d.serialNo, d.location, d.status, d.purchaseDate, d.warrantyUntil, d.lastServiceDate, d.nextServiceDate, d.notes],
    );
    await audit(c, context.userId, "device.created", "device", id);
    return { id };
  });

export const deleteDevice = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context, data }: { context: { userId: string }; data: { id: string } }) => {
    const c = await ctx(context.userId);
    await c.sql.query(`delete from lab_devices where id = $1 and lab_id = $2`, [data.id, c.labId]);
    await audit(c, context.userId, "device.deleted", "device", data.id);
    return { id: data.id };
  });

// ───────────────────────── supplies ─────────────────────────

export const saveSupply = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context, data }: { context: { userId: string }; data: Record<string, unknown> & { id?: string | null } }) => {
    const c = await ctx(context.userId);
    const s = cleanSupplyInput(data);
    if (data.id) {
      // One statement: update the item and, when the quantity itself was edited, write the difference as an "adjust" movement.
      const rows = await c.sql.query<{ id: string }>(
        `with prev as (select quantity from lab_supplies where id = $1::text and lab_id = $2::text),
              upd as (
                update lab_supplies set name=$3, unit=$4, quantity=$5::numeric, min_quantity=$6::numeric, expiry_date=$7::date,
                  lot_no=$8, supplier=$9, notes=$10, updated_at=now()
                where id = $1::text and lab_id = $2::text returning id, quantity
              ),
              mv as (
                insert into lab_supply_moves (id, lab_id, supply_id, delta, kind, note, created_by)
                select $11::text, $2::text, upd.id, upd.quantity - prev.quantity, 'adjust', 'تعديل الكمية يدويًا', $12::text
                from upd, prev where upd.quantity <> prev.quantity
                returning id
              )
         select id from upd`,
        [data.id, c.labId, s.name, s.unit, s.quantity, s.minQuantity, s.expiryDate, s.lotNo, s.supplier, s.notes, randomUUID(), context.userId],
      );
      if (!rows.length) throw new Error("الصنف غير موجود");
      await audit(c, context.userId, "supply.updated", "supply", data.id);
      return { id: data.id };
    }
    const id = randomUUID();
    await c.sql.query(
      `insert into lab_supplies (id, lab_id, name, unit, quantity, min_quantity, expiry_date, lot_no, supplier, notes)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [id, c.labId, s.name, s.unit, s.quantity, s.minQuantity, s.expiryDate, s.lotNo, s.supplier, s.notes],
    );
    if (s.quantity > 0) {
      await c.sql.query(
        `insert into lab_supply_moves (id, lab_id, supply_id, delta, kind, note, created_by) values ($1,$2,$3,$4,'in','رصيد أول',$5)`,
        [randomUUID(), c.labId, id, s.quantity, context.userId],
      );
    }
    await audit(c, context.userId, "supply.created", "supply", id);
    return { id };
  });

export const deleteSupply = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context, data }: { context: { userId: string }; data: { id: string } }) => {
    const c = await ctx(context.userId);
    await c.sql.query(`delete from lab_supplies where id = $1 and lab_id = $2`, [data.id, c.labId]);
    await audit(c, context.userId, "supply.deleted", "supply", data.id);
    return { id: data.id };
  });

/** Received ("in") or used ("out"). Balance change and movement row are one statement; an "out" larger than the balance fails and changes nothing. */
export const moveSupply = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context, data }: { context: { userId: string }; data: { id: string; kind: string; amount: string | number; note?: string | null } }) => {
    const c = await ctx(context.userId);
    const m = cleanMoveInput(data);
    const delta = m.kind === "out" ? -m.amount : m.amount;
    const rows = await c.sql.query<{ quantity: string | number }>(
      `with upd as (
         update lab_supplies set quantity = quantity + $3::numeric, updated_at = now()
         where id = $1::text and lab_id = $2::text and quantity + $3::numeric >= 0
         returning id, quantity
       ),
       mv as (
         insert into lab_supply_moves (id, lab_id, supply_id, delta, kind, note, created_by)
         select $4::text, $2::text, upd.id, $3::numeric, $5::text, $6::text, $7::text from upd
         returning id
       )
       select quantity from upd`,
      [data.id, c.labId, delta, randomUUID(), m.kind, m.note, context.userId],
    );
    if (!rows.length) throw new Error("الكمية المتاحة أقل من المطلوب، أو الصنف غير موجود");
    await audit(c, context.userId, "supply.moved", "supply", data.id);
    return { quantity: Number(rows[0].quantity) };
  });

export const listSupplyMoves = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context, data }: { context: { userId: string }; data: { id: string } }): Promise<SupplyMove[]> => {
    const { sql, labId } = await ctx(context.userId);
    const rows = await sql<{ id: string; kind: SupplyMove["kind"]; delta: string | number; note: string | null; moved_at: string }>`
      select id, kind, delta, note, to_char(created_at at time zone 'Africa/Cairo', 'YYYY-MM-DD HH24:MI') as moved_at
      from lab_supply_moves where supply_id = ${data.id} and lab_id = ${labId}
      order by created_at desc limit 30
    `;
    return rows.map((r) => ({ id: r.id, kind: r.kind, delta: Number(r.delta), note: r.note, createdAt: r.moved_at }));
  });
