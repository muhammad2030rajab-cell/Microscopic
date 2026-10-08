-- Licenses for the local (customer-hosted) program. This is the ONLY thing the license server stores: a code's
-- hash and which machines activated it. No customer data ever reaches this database.
CREATE TABLE IF NOT EXISTS licenses (
  id text PRIMARY KEY,
  code_hash text NOT NULL UNIQUE,
  note text NOT NULL DEFAULT '',
  max_devices integer NOT NULL DEFAULT 1 CHECK (max_devices BETWEEN 1 AND 20),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
  created_by text,
  created_at timestamptz NOT NULL DEFAULT current_timestamp
);

CREATE TABLE IF NOT EXISTS license_activations (
  id text PRIMARY KEY,
  license_id text NOT NULL REFERENCES licenses(id) ON DELETE CASCADE,
  fingerprint text NOT NULL,
  device_name text NOT NULL DEFAULT '',
  activated_at timestamptz NOT NULL DEFAULT current_timestamp,
  last_seen_at timestamptz,
  released_at timestamptz
);
CREATE INDEX IF NOT EXISTS license_activations_license_idx ON license_activations (license_id);
