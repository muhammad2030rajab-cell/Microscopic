-- Test names repeat across categories ("Color" and "Blood" in urine and stool,
-- "RBCs" in CBC and stool). Uniqueness must be per category, otherwise the
-- second one is silently dropped when a lab's catalog is seeded.
ALTER TABLE lab_test_catalog
  DROP CONSTRAINT IF EXISTS lab_test_catalog_lab_id_test_name_key;

CREATE UNIQUE INDEX IF NOT EXISTS uq_lab_test_catalog_lab_category_name
  ON lab_test_catalog(lab_id, category_id, test_name);
