-- Lab branches (V1). A lab with no branches behaves exactly as before.
-- The owner sees every branch; a staff member assigned to a branch only sees that
-- branch's reports. Branches are deactivated, never deleted: deleting one would
-- silently turn its restricted staff into unrestricted ones, so the references
-- below deliberately use the default NO ACTION (labs still cascade as a whole).
CREATE TABLE IF NOT EXISTS branches (
  id text PRIMARY KEY,
  lab_id text NOT NULL REFERENCES labs(id) ON DELETE CASCADE,
  name text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT current_timestamp,
  UNIQUE (lab_id, name)
);
ALTER TABLE lab_users ADD COLUMN IF NOT EXISTS branch_id text REFERENCES branches(id);
ALTER TABLE reports ADD COLUMN IF NOT EXISTS branch_id text REFERENCES branches(id);
CREATE INDEX IF NOT EXISTS reports_lab_branch_idx ON reports (lab_id, branch_id);
