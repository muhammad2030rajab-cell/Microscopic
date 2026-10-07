-- Platform invitation codes: the platform admin makes a code, the new lab owner types it on /join and
-- creates their own lab + login (no more creating every account by hand). Only the code's hash is stored.
CREATE TABLE IF NOT EXISTS lab_invites (
  id text PRIMARY KEY,
  code_hash text NOT NULL,
  label text NOT NULL DEFAULT '',
  max_uses integer NOT NULL DEFAULT 1 CHECK (max_uses BETWEEN 1 AND 100),
  uses integer NOT NULL DEFAULT 0,
  expires_at timestamptz,
  revoked_at timestamptz,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT current_timestamp
);
CREATE UNIQUE INDEX IF NOT EXISTS lab_invites_code_hash_idx ON lab_invites (code_hash);
-- Which invitation created a lab (null = created by hand by an admin).
ALTER TABLE labs ADD COLUMN IF NOT EXISTS invite_id text;
