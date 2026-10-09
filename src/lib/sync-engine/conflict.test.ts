import assert from "node:assert/strict";
import { test } from "node:test";
import { decidePush, reconcileWithApplied } from "./conflict.ts";

const draft = (version: number) => ({ version, status: "draft" });

test("creating a new row applies; creating one the server already has is a harmless retry", () => {
  assert.deepEqual(decidePush({ entity: "reports", op: "upsert", baseVersion: null, server: null }), { kind: "apply" });
  assert.deepEqual(decidePush({ entity: "reports", op: "upsert", baseVersion: null, server: draft(2) }), { kind: "already_applied" });
  // ...even if the report was approved in the meantime: a retry must not turn into an error.
  assert.deepEqual(
    decidePush({ entity: "reports", op: "upsert", baseVersion: null, server: { version: 5, status: "approved" } }),
    { kind: "already_applied" },
  );
});

test("editing a draft: same version applies, a stale version is a conflict (never overwrites)", () => {
  assert.deepEqual(decidePush({ entity: "reports", op: "upsert", baseVersion: 3, server: draft(3) }), { kind: "apply" });
  assert.deepEqual(decidePush({ entity: "reports", op: "upsert", baseVersion: 2, server: draft(3) }), { kind: "conflict", reason: "server_newer" });
  assert.deepEqual(decidePush({ entity: "reports", op: "upsert", baseVersion: 9, server: draft(3) }), { kind: "conflict", reason: "version_mismatch" });
});

test("a cancelled report is locked against offline edits, any other report can be edited", () => {
  assert.deepEqual(
    decidePush({ entity: "reports", op: "upsert", baseVersion: 4, server: { version: 4, status: "cancelled" } }),
    { kind: "reject", reason: "report_locked" },
  );
  for (const status of ["draft", "pending_review", "approved"]) {
    assert.deepEqual(
      decidePush({ entity: "reports", op: "upsert", baseVersion: 4, server: { version: 4, status } }),
      { kind: "apply" },
      status,
    );
  }
});

test("editing a report that was deleted on the server is a conflict, not a resurrection", () => {
  assert.deepEqual(decidePush({ entity: "reports", op: "upsert", baseVersion: 1, server: null }), { kind: "conflict", reason: "deleted_on_server" });
});

test("deletes: gone already = done; draft report with the right version applies; the rest needs a person online", () => {
  assert.deepEqual(decidePush({ entity: "reports", op: "delete", baseVersion: 1, server: null }), { kind: "already_applied" });
  assert.deepEqual(decidePush({ entity: "reports", op: "delete", baseVersion: 2, server: draft(2) }), { kind: "apply" });
  assert.deepEqual(decidePush({ entity: "reports", op: "delete", baseVersion: 1, server: draft(2) }), { kind: "conflict", reason: "server_newer" });
  assert.deepEqual(decidePush({ entity: "reports", op: "delete", baseVersion: 2, server: { version: 2, status: "approved" } }), { kind: "reject", reason: "requires_online" });
});

test("patients on their own, catalog and attachments cannot be written offline in v1", () => {
  for (const entity of ["patients", "lab_test_catalog", "report_attachments"] as const) {
    for (const op of ["upsert", "delete"] as const) {
      assert.deepEqual(decidePush({ entity, op, baseVersion: 1, server: { version: 1 } }), { kind: "reject", reason: "not_supported_offline" });
    }
  }
});

test("reconcile: a change id never seen is decided normally", () => {
  assert.deepEqual(reconcileWithApplied(null, { baseVersion: 3, payloadHash: "h1" }), { kind: "proceed", baseVersion: 3 });
});

test("reconcile: the same change arriving again is answered, not re-applied", () => {
  assert.deepEqual(
    reconcileWithApplied({ resultVersion: 4, payloadHash: "h1" }, { baseVersion: 3, payloadHash: "h1" }),
    { kind: "already_applied", version: 4 },
  );
});

test("reconcile: an edit made again before the reply builds on the device's own earlier write", () => {
  assert.deepEqual(
    reconcileWithApplied({ resultVersion: 4, payloadHash: "h1" }, { baseVersion: 3, payloadHash: "h2" }),
    { kind: "proceed", baseVersion: 4 },
  );
  // ...and that is then judged against the server's real version: still a conflict if someone else edited since.
  assert.deepEqual(decidePush({ entity: "reports", op: "upsert", baseVersion: 4, server: { version: 5, status: "draft" } }), { kind: "conflict", reason: "server_newer" });
  assert.deepEqual(decidePush({ entity: "reports", op: "upsert", baseVersion: 4, server: { version: 4, status: "draft" } }), { kind: "apply" });
});

test("reconcile: no recorded version falls back to the incoming base", () => {
  assert.deepEqual(reconcileWithApplied({ resultVersion: null, payloadHash: "h1" }, { baseVersion: 3, payloadHash: "h2" }), { kind: "proceed", baseVersion: 3 });
});
