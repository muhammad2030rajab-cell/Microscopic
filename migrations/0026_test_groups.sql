-- Lab-defined test groups ("CHECKUP 1", "Pre-marriage panel"...): a name plus an ordered list of
-- lab_test_catalog ids. Choosing a group while creating a report adds all its tests at once.
-- The ids live in one jsonb array on purpose: a group is read and written as a whole, and an id whose
-- catalog row is gone is simply skipped when the group is used.
CREATE TABLE IF NOT EXISTS lab_test_groups (
  id text PRIMARY KEY,
  lab_id text NOT NULL REFERENCES labs(id) ON DELETE CASCADE,
  name text NOT NULL,
  catalog_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT current_timestamp,
  updated_at timestamptz NOT NULL DEFAULT current_timestamp,
  UNIQUE (lab_id, name)
);
