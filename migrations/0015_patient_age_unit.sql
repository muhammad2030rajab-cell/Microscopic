-- Infants: age was a whole number of YEARS (minimum 1). Add the unit so a
-- 3-month-old or a 10-day-old can be registered. Existing rows stay "years".
-- One idempotent statement (the column and its CHECK are skipped together if it already exists).
ALTER TABLE patients
  ADD COLUMN IF NOT EXISTS age_unit text NOT NULL DEFAULT 'years'
  CHECK (age_unit IN ('years', 'months', 'days'));
