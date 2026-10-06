-- New labs print English-only reports by default. Existing labs keep whatever they have stored
-- (the owner can change it any time in Settings > Report design), so nothing already printed changes.
ALTER TABLE labs ALTER COLUMN report_language SET DEFAULT 'en';
