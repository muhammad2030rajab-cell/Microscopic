-- Central, admin-editable platform settings (key/value). Only keys that the app
-- actually reads are written: support_whatsapp (login page contact button) and
-- announcement (banner on every lab's dashboard).
CREATE TABLE IF NOT EXISTS platform_settings (
  key text PRIMARY KEY,
  value text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT current_timestamp,
  updated_by text REFERENCES "user"(id) ON DELETE SET NULL
);
