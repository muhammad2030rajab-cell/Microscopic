-- Sample lifecycle tracking for LIS operations.
-- Reuses reports.sample_id as the specimen/barcode identifier and adds an explicit workflow state.
ALTER TABLE reports ADD COLUMN IF NOT EXISTS sample_status text NOT NULL DEFAULT 'registered'
  CHECK (sample_status IN ('registered','collected','received','processing','ready'));
ALTER TABLE reports ADD COLUMN IF NOT EXISTS sample_section text;
ALTER TABLE reports ADD COLUMN IF NOT EXISTS collected_by text REFERENCES lab_users(id) ON DELETE SET NULL;
ALTER TABLE reports ADD COLUMN IF NOT EXISTS received_at timestamptz;
ALTER TABLE reports ADD COLUMN IF NOT EXISTS processing_at timestamptz;
ALTER TABLE reports ADD COLUMN IF NOT EXISTS ready_at timestamptz;

CREATE INDEX IF NOT EXISTS reports_sample_status_idx ON reports(lab_id, sample_status);
CREATE INDEX IF NOT EXISTS reports_sample_id_idx ON reports(lab_id, sample_id);
