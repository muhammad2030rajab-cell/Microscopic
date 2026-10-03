import assert from "node:assert/strict";
import { test } from "node:test";
import {
  memoryLocalStore,
  pullAll,
  pushOutbox,
  syncOnce,
  type OutboxItem,
  type PullPage,
  type PushResult,
  type SyncTransport,
} from "./engine.ts";

const LAB = "lab-1";
const emptyRows = () => ({ patients: [], reports: [], lab_test_catalog: [], report_attachments: [] }) as PullPage["rows"];

function page(over: Partial<PullPage>): PullPage {
  return { changes: [], rows: emptyRows(), reportResults: [], cursor: 0, hasMore: false, ...over };
}

function outboxItem(id: string, over: Partial<OutboxItem> = {}): OutboxItem {
  return {
    id, labId: LAB, entity: "reports", entityId: `r-${id}`, op: "upsert", baseVersion: null,
    payload: { n: id }, createdAt: `2026-10-03T10:00:0${id}.000Z`, status: "pending", attempts: 0, ...over,
  };
}

/** A transport whose answers the test scripts. */
function fakeTransport(opts: { pages?: PullPage[]; pushReply?: (items: OutboxItem[]) => PushResult[]; failWith?: Error }) {
  const pages = [...(opts.pages ?? [])];
  const calls = { pull: [] as number[], push: [] as string[][] };
  const transport: SyncTransport = {
    async pull(since) {
      if (opts.failWith) throw opts.failWith;
      calls.pull.push(since);
      return pages.shift() ?? page({ cursor: since });
    },
    async push(items) {
      if (opts.failWith) throw opts.failWith;
      calls.push.push(items.map((i) => i.id));
      return opts.pushReply ? opts.pushReply(items) : items.map((i) => ({ id: i.id, status: "applied", version: 1 }) as PushResult);
    },
  };
  return { transport, calls };
}

test("pull applies rows, a report's results, and moves the cursor", async () => {
  const store = memoryLocalStore();
  const { transport } = fakeTransport({
    pages: [
      page({
        changes: [
          { seq: 1, entity: "patients", entityId: "p1", op: "upsert", version: 1 },
          { seq: 2, entity: "reports", entityId: "r1", op: "upsert", version: 2 },
        ],
        rows: { ...emptyRows(), patients: [{ id: "p1", full_name: "منى" }], reports: [{ id: "r1", patient_id: "p1", status: "draft" }] },
        reportResults: [
          { id: "x1", report_id: "r1", test_name: "Hb", sort_order: 0 },
          { id: "x2", report_id: "r1", test_name: "WBC", sort_order: 1 },
        ],
        cursor: 2,
      }),
    ],
  });
  const res = await pullAll(store, transport, LAB);
  assert.deepEqual(res, { pages: 1, changes: 2 });
  assert.equal(await store.getCursor(LAB), 2);
  assert.equal(store.getRow("patients", "p1")?.full_name, "منى");
  assert.equal(store.getResults("r1").length, 2);
});

test("pull follows hasMore across pages, asking from the cursor each time", async () => {
  const store = memoryLocalStore();
  const { transport, calls } = fakeTransport({
    pages: [
      page({ changes: [{ seq: 1, entity: "patients", entityId: "a", op: "upsert", version: 1 }], rows: { ...emptyRows(), patients: [{ id: "a" }] }, cursor: 1, hasMore: true }),
      page({ changes: [{ seq: 2, entity: "patients", entityId: "b", op: "upsert", version: 1 }], rows: { ...emptyRows(), patients: [{ id: "b" }] }, cursor: 2, hasMore: false }),
    ],
  });
  const res = await pullAll(store, transport, LAB);
  assert.equal(res.pages, 2);
  assert.deepEqual(calls.pull, [0, 1]);
  assert.equal(store.listRows("patients").length, 2);
});

test("a delete removes the row and the report's results", async () => {
  const store = memoryLocalStore();
  const { transport } = fakeTransport({
    pages: [
      page({
        changes: [{ seq: 1, entity: "reports", entityId: "r1", op: "upsert", version: 1 }],
        rows: { ...emptyRows(), reports: [{ id: "r1" }] },
        reportResults: [{ id: "x", report_id: "r1" }],
        cursor: 1,
      }),
      page({ changes: [{ seq: 2, entity: "reports", entityId: "r1", op: "delete", version: null }], cursor: 2 }),
    ],
  });
  await pullAll(store, transport, LAB);
  await pullAll(store, transport, LAB);
  assert.equal(store.getRow("reports", "r1"), undefined);
  assert.equal(store.getResults("r1").length, 0);
});

test("an upsert whose row is gone from the page is skipped, not invented", async () => {
  const store = memoryLocalStore();
  const { transport } = fakeTransport({
    pages: [page({ changes: [{ seq: 1, entity: "patients", entityId: "ghost", op: "upsert", version: 1 }], cursor: 1 })],
  });
  await pullAll(store, transport, LAB);
  assert.equal(store.getRow("patients", "ghost"), undefined);
  assert.equal(await store.getCursor(LAB), 1);
});

test("applying the same page twice changes nothing (idempotent)", async () => {
  const store = memoryLocalStore();
  const same = () =>
    page({
      changes: [{ seq: 1, entity: "patients", entityId: "p", op: "upsert", version: 1 }],
      rows: { ...emptyRows(), patients: [{ id: "p", full_name: "A" }] },
      cursor: 1,
    });
  await store.applyPage(LAB, same());
  await store.applyPage(LAB, same());
  assert.equal(store.listRows("patients").length, 1);
});

test("a stuck cursor (hasMore but no progress) throws instead of looping forever", async () => {
  const store = memoryLocalStore();
  const { transport } = fakeTransport({ pages: [page({ cursor: 0, hasMore: true })] });
  await assert.rejects(() => pullAll(store, transport, LAB), /SYNC_CURSOR_STUCK/);
});

test("a crash while applying a page leaves rows AND cursor untouched", async () => {
  const store = memoryLocalStore();
  const bad = page({
    // Same row id listed twice with a poisoned row: structuredClone of a function throws mid-apply.
    changes: [
      { seq: 1, entity: "patients", entityId: "ok", op: "upsert", version: 1 },
      { seq: 2, entity: "patients", entityId: "boom", op: "upsert", version: 1 },
    ],
    rows: { ...emptyRows(), patients: [{ id: "ok" }, { id: "boom", fn: () => 1 }] },
    cursor: 2,
  });
  await assert.rejects(() => store.applyPage(LAB, bad));
  assert.equal(await store.getCursor(LAB), 0);
  assert.equal(store.listRows("patients").length, 0);
});

test("push: applied items leave the outbox; conflict and rejected stay, flagged with the reason", async () => {
  const store = memoryLocalStore();
  for (const id of ["1", "2", "3"]) await store.putOutbox(outboxItem(id));
  const { transport } = fakeTransport({
    pushReply: () => [
      { id: "1", status: "applied", version: 3 },
      { id: "2", status: "conflict", reason: "server_newer" },
      { id: "3", status: "rejected", reason: "report_locked" },
    ],
  });
  const res = await pushOutbox(store, transport, LAB);
  assert.deepEqual(res, { sent: 3, applied: 1, conflicts: 1, rejected: 1 });
  const left = await store.listOutbox(LAB);
  assert.deepEqual(left.map((i) => [i.id, i.status, i.reason, i.attempts]).sort(), [
    ["2", "conflict", "server_newer", 1],
    ["3", "rejected", "report_locked", 1],
  ]);
});

test("push sends oldest first and never re-sends items already flagged", async () => {
  const store = memoryLocalStore();
  await store.putOutbox(outboxItem("2", { createdAt: "2026-10-03T10:00:02.000Z" }));
  await store.putOutbox(outboxItem("1", { createdAt: "2026-10-03T10:00:01.000Z" }));
  await store.putOutbox(outboxItem("3", { status: "conflict", reason: "server_newer" }));
  const { transport, calls } = fakeTransport({});
  await pushOutbox(store, transport, LAB);
  assert.deepEqual(calls.push, [["1", "2"]]);
});

test("an item the server gave no verdict for stays pending", async () => {
  const store = memoryLocalStore();
  await store.putOutbox(outboxItem("1"));
  await store.putOutbox(outboxItem("2"));
  const { transport } = fakeTransport({ pushReply: () => [{ id: "1", status: "applied", version: 1 }] });
  await pushOutbox(store, transport, LAB);
  const left = await store.listOutbox(LAB);
  assert.deepEqual(left.map((i) => [i.id, i.status]), [["2", "pending"]]);
});

test("offline: syncOnce reports it calmly and loses nothing", async () => {
  const store = memoryLocalStore();
  await store.putOutbox(outboxItem("1"));
  const { transport } = fakeTransport({ failWith: new TypeError("Failed to fetch") });
  const res = await syncOnce(store, transport, LAB);
  assert.deepEqual(res, { ok: false, offline: true, stage: "push" });
  assert.equal((await store.listOutbox(LAB)).length, 1);
  assert.equal(await store.getCursor(LAB), 0);
});

test("a real server error is not swallowed as 'offline'", async () => {
  const store = memoryLocalStore();
  await store.putOutbox(outboxItem("1"));
  const { transport } = fakeTransport({ failWith: new Error("PERMISSION_DENIED") });
  await assert.rejects(() => syncOnce(store, transport, LAB), /PERMISSION_DENIED/);
});

test("syncOnce pushes first, then pulls", async () => {
  const store = memoryLocalStore();
  await store.putOutbox(outboxItem("1"));
  const order: string[] = [];
  const transport: SyncTransport = {
    async push(items) {
      order.push("push");
      return items.map((i) => ({ id: i.id, status: "applied", version: 1 }) as PushResult);
    },
    async pull(since) {
      order.push("pull");
      return page({ cursor: since });
    },
  };
  const res = await syncOnce(store, transport, LAB);
  assert.equal(res.ok, true);
  assert.deepEqual(order, ["push", "pull"]);
});

test("each lab has its own cursor and outbox", async () => {
  const store = memoryLocalStore();
  await store.applyPage("lab-a", page({ cursor: 7 }));
  await store.putOutbox(outboxItem("1", { labId: "lab-b" }));
  assert.equal(await store.getCursor("lab-a"), 7);
  assert.equal(await store.getCursor("lab-b"), 0);
  assert.equal((await store.listOutbox("lab-a")).length, 0);
});
