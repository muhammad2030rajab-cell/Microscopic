-- Age-specific reference ranges, entered by the lab as plain text
-- (see src/lib/age-ranges.ts for the line format). NULL = none; the lab's
-- male/female range applies as before.
ALTER TABLE lab_test_catalog ADD COLUMN IF NOT EXISTS age_ranges text;
