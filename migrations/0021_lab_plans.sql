-- Plans & subscriptions (V1). Limits are stored per lab so the platform admin can
-- customise them; the named presets live in src/lib/lab-plans.ts. NULL means
-- "unlimited" / "no expiry", so every existing lab keeps working unchanged.
ALTER TABLE labs ADD COLUMN IF NOT EXISTS plan_name text;
ALTER TABLE labs ADD COLUMN IF NOT EXISTS max_users integer;
ALTER TABLE labs ADD COLUMN IF NOT EXISTS max_reports_per_month integer;
ALTER TABLE labs ADD COLUMN IF NOT EXISTS subscription_ends_at date;
