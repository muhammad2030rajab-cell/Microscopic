-- Offline "add patient": a device that created a patient with no connection sends it later with a
-- request id, so a lost reply followed by a retry can never create the same patient twice
-- (same idea as reports.client_request_id, migration 0013). Only a new column and index.
ALTER TABLE patients ADD COLUMN IF NOT EXISTS client_request_id text;
CREATE UNIQUE INDEX IF NOT EXISTS patients_lab_client_request_id_idx
  ON patients(lab_id, client_request_id)
  WHERE client_request_id IS NOT NULL;
