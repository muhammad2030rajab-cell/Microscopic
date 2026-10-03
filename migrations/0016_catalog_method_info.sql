-- How a test is performed, copied by the lab from the reagent-kit pamphlet
-- (method, kit/lot, sample, procedure, linearity...). Free text; NULL = none.
-- Separate from the ranges: any lab user except "viewer" may edit it.
ALTER TABLE lab_test_catalog ADD COLUMN IF NOT EXISTS method_info text;
