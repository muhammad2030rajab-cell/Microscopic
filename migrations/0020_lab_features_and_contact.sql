-- Per-lab feature switches. Every feature is ON by default; a lab only stores
-- the keys the platform admin switched OFF (see src/lib/lab-features.ts).
ALTER TABLE labs ADD COLUMN IF NOT EXISTS disabled_features text[] NOT NULL DEFAULT '{}';
-- New platform_settings keys (support_email, website_url, support_text) need no
-- schema change: platform_settings is key/value.
