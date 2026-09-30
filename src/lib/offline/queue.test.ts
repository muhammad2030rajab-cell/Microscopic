import test from "node:test";
import assert from "node:assert/strict";
import { enqueue, flush, listForLab, memoryStore, retry } from "./queue.ts";
import { isNetworkError } from "./network-error.ts";

const mk = (id: string, createdAt: string, labId = "lab1") => ({
  id,
  labId,
  createdAt,
  label: `patient ${id}`,
  payload: { id },
});

test("flush sends oldest first and clears the queue", async () => {
  const store = memoryStore();
  await enqueue(store, mk("b", "2026-09-29T10:00:00Z"));
  await enqueue(store, mk("a", "2026-09-29T09:00:00Z"));
  const order: string[] = [];
  const r = await flush(store, "lab1", async (i) => void order.push(i.id), isNetworkError);
  assert.deepEqual(order, ["a", "b"]);
  assert.deepEqual(r, { sent: 2, failed: 0, offline: false });
  assert.equal((await store.list()).length, 0);
});

test("a network failure stops the run and keeps everything queued", async () => {
  const store = memoryStore();
  await enqueue(store, mk("a", "2026-09-29T09:00:00Z"));
  await enqueue(store, mk("b", "2026-09-29T10:00:00Z"));
  const sent: string[] = [];
  const r = await flush(
    store,
    "lab1",
    async (i) => {
      if (i.id === "b") throw new TypeError("Failed to fetch");
      sent.push(i.id);
    },
    isNetworkError,
  );
  assert.deepEqual(sent, ["a"]);
  assert.equal(r.offline, true);
  const left = await store.list();
  assert.deepEqual(left.map((i) => [i.id, i.status]), [["b", "pending"]]);
});

test("a server rejection marks only that item failed and continues", async () => {
  const store = memoryStore();
  await enqueue(store, mk("a", "2026-09-29T09:00:00Z"));
  await enqueue(store, mk("b", "2026-09-29T10:00:00Z"));
  const r = await flush(
    store,
    "lab1",
    async (i) => {
      if (i.id === "a") throw new Error("السن غير صالح");
    },
    isNetworkError,
  );
  assert.deepEqual(r, { sent: 1, failed: 1, offline: false });
  const [a] = await store.list();
  assert.equal(a.status, "failed");
  assert.equal(a.lastError, "السن غير صالح");
  assert.equal(a.attempts, 1);
});

test("failed items are not resent until retried", async () => {
  const store = memoryStore();
  await enqueue(store, mk("a", "2026-09-29T09:00:00Z"));
  await flush(store, "lab1", async () => { throw new Error("bad"); }, isNetworkError);
  let calls = 0;
  await flush(store, "lab1", async () => void (calls += 1), isNetworkError);
  assert.equal(calls, 0);
  await retry(store, "a");
  await flush(store, "lab1", async () => void (calls += 1), isNetworkError);
  assert.equal(calls, 1);
  assert.equal((await store.list()).length, 0);
});

test("items of another lab are never listed or sent", async () => {
  const store = memoryStore();
  await enqueue(store, mk("a", "2026-09-29T09:00:00Z", "lab1"));
  await enqueue(store, mk("z", "2026-09-29T09:00:00Z", "lab2"));
  assert.deepEqual((await listForLab(store, "lab1")).map((i) => i.id), ["a"]);
  assert.deepEqual(await listForLab(store, null), []);
  const sent: string[] = [];
  await flush(store, "lab1", async (i) => void sent.push(i.id), isNetworkError);
  assert.deepEqual(sent, ["a"]);
  assert.equal((await store.list()).length, 1);
});

test("isNetworkError separates offline failures from server rejections", () => {
  assert.equal(isNetworkError(new TypeError("Failed to fetch")), true);
  assert.equal(isNetworkError(new TypeError("Load failed")), true);
  assert.equal(isNetworkError(new Error("anything"), false), true);
  assert.equal(isNetworkError(new Error("السن غير صالح")), false);
  assert.equal(isNetworkError(new Error("LAB_MISMATCH")), false);
  assert.equal(isNetworkError(new TypeError("x is not a function")), false);
  assert.equal(isNetworkError(null), false);
});

import { effectiveCreatedAt } from "./created-at.ts";

test("effectiveCreatedAt keeps plausible device times and rejects bad clocks", () => {
  const now = new Date("2026-09-30T12:00:00Z");
  assert.equal(effectiveCreatedAt("2026-09-30T09:00:00Z", now).toISOString(), "2026-09-30T09:00:00.000Z");
  assert.equal(effectiveCreatedAt(undefined, now), now);
  assert.equal(effectiveCreatedAt("not a date", now), now);
  assert.equal(effectiveCreatedAt("2026-10-05T00:00:00Z", now), now); // future
  assert.equal(effectiveCreatedAt("2026-01-01T00:00:00Z", now), now); // too old
  assert.equal(effectiveCreatedAt("2026-09-30T12:03:00Z", now).toISOString(), "2026-09-30T12:03:00.000Z"); // small skew ok
});
