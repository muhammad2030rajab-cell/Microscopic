-- Offline support: a report created on a phone without connection is sent later.
-- The client generates a request id once; the server uses it to make the
-- create call idempotent (a retry after a lost response must not duplicate).
ALTER TABLE reports ADD COLUMN IF NOT EXISTS client_request_id text;

CREATE UNIQUE INDEX IF NOT EXISTS uq_reports_lab_client_request
  ON reports(lab_id, client_request_id)
  WHERE client_request_id IS NOT NULL;
