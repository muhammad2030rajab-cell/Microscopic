CREATE TABLE IF NOT EXISTS lab_test_catalog (
  id TEXT PRIMARY KEY,
  lab_id TEXT NOT NULL REFERENCES labs(id) ON DELETE CASCADE,
  test_name TEXT NOT NULL,
  category_id TEXT NOT NULL,
  category_name_ar TEXT NOT NULL,
  category_name_en TEXT NOT NULL,
  unit TEXT NOT NULL DEFAULT '',
  male_range TEXT NOT NULL,
  female_range TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(lab_id, test_name)
);

CREATE INDEX IF NOT EXISTS idx_lab_test_catalog_lab_active
  ON lab_test_catalog(lab_id, is_active);
