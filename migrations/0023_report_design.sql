-- Per-lab report design (accent colour, paper mode, table style, footer, ...).
-- One small jsonb document; NULL = the built-in look, so existing labs print
-- exactly as before. Signature / stamp images live in the same document but are
-- kept out of getCurrentLab (which runs on every page) — see report-design-settings.ts.
ALTER TABLE labs ADD COLUMN IF NOT EXISTS report_design jsonb;
