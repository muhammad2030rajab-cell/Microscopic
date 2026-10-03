-- Sync foundation (step 1 of the offline-first plan: Windows hub + Android).
-- Every syncable row gets a `version` that grows on each UPDATE, and every
-- insert/update/delete is recorded in `sync_changes` (a per-lab change log with
-- an increasing `seq`). A device asks "what changed since seq N?" and gets
-- deletes as tombstones too, so nothing needs soft-delete columns and no
-- existing query changes. Nothing here changes how the app reads or writes data.

CREATE TABLE IF NOT EXISTS sync_changes (
  seq        bigserial PRIMARY KEY,
  -- No foreign key on purpose: tombstones must survive the row (and its lab).
  lab_id     text NOT NULL,
  entity     text NOT NULL CHECK (entity IN ('patients', 'reports', 'lab_test_catalog', 'report_attachments')),
  entity_id  text NOT NULL,
  op         text NOT NULL CHECK (op IN ('upsert', 'delete')),
  version    integer,
  -- Filled from the `app.device_id` session setting when the app sets it, else NULL.
  device_id  text,
  changed_at timestamptz NOT NULL DEFAULT current_timestamp
);
CREATE INDEX IF NOT EXISTS idx_sync_changes_lab_seq ON sync_changes(lab_id, seq);
CREATE INDEX IF NOT EXISTS idx_sync_changes_entity ON sync_changes(entity, entity_id);

ALTER TABLE patients           ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;
ALTER TABLE reports            ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;
ALTER TABLE lab_test_catalog   ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;
ALTER TABLE report_attachments ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;
ALTER TABLE report_attachments ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE OR REPLACE FUNCTION sync_bump_version() RETURNS trigger AS $$
BEGIN
  NEW.version := COALESCE(OLD.version, 1) + 1;
  NEW.updated_at := current_timestamp;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION sync_record_change() RETURNS trigger AS $$
DECLARE
  rec record;
BEGIN
  IF TG_OP = 'DELETE' THEN
    rec := OLD;
  ELSE
    rec := NEW;
  END IF;
  INSERT INTO sync_changes (lab_id, entity, entity_id, op, version, device_id)
  VALUES (
    rec.lab_id,
    TG_TABLE_NAME,
    rec.id,
    CASE WHEN TG_OP = 'DELETE' THEN 'delete' ELSE 'upsert' END,
    CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE rec.version END,
    NULLIF(current_setting('app.device_id', true), '')
  );
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Existing rows enter the log once (before the triggers exist), so a brand-new
-- device can build its local copy by reading the log from seq 0.
INSERT INTO sync_changes (lab_id, entity, entity_id, op, version)
  SELECT lab_id, 'patients', id, 'upsert', version FROM patients;
INSERT INTO sync_changes (lab_id, entity, entity_id, op, version)
  SELECT lab_id, 'reports', id, 'upsert', version FROM reports;
INSERT INTO sync_changes (lab_id, entity, entity_id, op, version)
  SELECT lab_id, 'lab_test_catalog', id, 'upsert', version FROM lab_test_catalog;
INSERT INTO sync_changes (lab_id, entity, entity_id, op, version)
  SELECT lab_id, 'report_attachments', id, 'upsert', version FROM report_attachments;

DROP TRIGGER IF EXISTS trg_patients_sync_bump ON patients;
CREATE TRIGGER trg_patients_sync_bump BEFORE UPDATE ON patients
  FOR EACH ROW EXECUTE FUNCTION sync_bump_version();
DROP TRIGGER IF EXISTS trg_patients_sync_log ON patients;
CREATE TRIGGER trg_patients_sync_log AFTER INSERT OR UPDATE OR DELETE ON patients
  FOR EACH ROW EXECUTE FUNCTION sync_record_change();

DROP TRIGGER IF EXISTS trg_reports_sync_bump ON reports;
CREATE TRIGGER trg_reports_sync_bump BEFORE UPDATE ON reports
  FOR EACH ROW EXECUTE FUNCTION sync_bump_version();
DROP TRIGGER IF EXISTS trg_reports_sync_log ON reports;
CREATE TRIGGER trg_reports_sync_log AFTER INSERT OR UPDATE OR DELETE ON reports
  FOR EACH ROW EXECUTE FUNCTION sync_record_change();

DROP TRIGGER IF EXISTS trg_lab_test_catalog_sync_bump ON lab_test_catalog;
CREATE TRIGGER trg_lab_test_catalog_sync_bump BEFORE UPDATE ON lab_test_catalog
  FOR EACH ROW EXECUTE FUNCTION sync_bump_version();
DROP TRIGGER IF EXISTS trg_lab_test_catalog_sync_log ON lab_test_catalog;
CREATE TRIGGER trg_lab_test_catalog_sync_log AFTER INSERT OR UPDATE OR DELETE ON lab_test_catalog
  FOR EACH ROW EXECUTE FUNCTION sync_record_change();

DROP TRIGGER IF EXISTS trg_report_attachments_sync_bump ON report_attachments;
CREATE TRIGGER trg_report_attachments_sync_bump BEFORE UPDATE ON report_attachments
  FOR EACH ROW EXECUTE FUNCTION sync_bump_version();
DROP TRIGGER IF EXISTS trg_report_attachments_sync_log ON report_attachments;
CREATE TRIGGER trg_report_attachments_sync_log AFTER INSERT OR UPDATE OR DELETE ON report_attachments
  FOR EACH ROW EXECUTE FUNCTION sync_record_change();
