-- Registration details taken at the front desk (sample types, fasting, clinical questions, referral entity).
-- One jsonb column on the report; validated by src/lib/report-intake.ts. Additive only.
ALTER TABLE reports ADD COLUMN IF NOT EXISTS intake jsonb;
