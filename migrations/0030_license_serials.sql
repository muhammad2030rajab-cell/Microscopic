-- Registration numbers for the local (Hub) program, kept in YOUR cloud deployment. You make a number per sale;
-- the customer types it once (internet needed once); the first computer to use it gets bound to it. Only the
-- number's hash is stored (like lab_invites): the number itself is shown once, when you create it.
CREATE TABLE IF NOT EXISTS license_serials (
  id text PRIMARY KEY,
  serial_hash text NOT NULL,
  last4 text NOT NULL,
  note text NOT NULL DEFAULT '',
  machine text,
  license_code text,
  activated_at timestamptz,
  disabled_at timestamptz,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT current_timestamp
);
CREATE UNIQUE INDEX IF NOT EXISTS license_serials_hash_idx ON license_serials (serial_hash);
