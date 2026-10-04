-- Idempotency record for changes pushed from offline devices.
-- A device re-sends a change when it never heard back (dropped connection after
-- the server had already applied it). Remembering what was applied for each
-- (lab, change id) lets the server answer "already done" instead of treating the
-- device's own earlier write as a conflict, and lets an edit made again before
-- the reply arrived build on top of the device's own earlier write.
CREATE TABLE IF NOT EXISTS sync_applied (
  lab_id         text NOT NULL,
  id             text NOT NULL,
  entity_id      text NOT NULL,
  result_version integer,
  payload_hash   text NOT NULL,
  applied_at     timestamptz NOT NULL DEFAULT current_timestamp,
  PRIMARY KEY (lab_id, id)
);
CREATE INDEX IF NOT EXISTS idx_sync_applied_at ON sync_applied(applied_at);
