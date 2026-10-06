-- Self-service "join the lab" requests. A lab owner can switch on a join code; someone who knows it
-- creates their own username + password, which stays PENDING (no access at all) until a manager
-- approves it. A pending person is a lab_users row with is_active = false and pending_approval = true,
-- so every existing "active users only" check already keeps them out.
-- Only a hash of the code is stored: the code is shown once when it is made.
ALTER TABLE labs ADD COLUMN IF NOT EXISTS join_code_hash text;
CREATE UNIQUE INDEX IF NOT EXISTS labs_join_code_hash_idx ON labs (join_code_hash) WHERE join_code_hash IS NOT NULL;
ALTER TABLE lab_users ADD COLUMN IF NOT EXISTS pending_approval boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS lab_users_pending_idx ON lab_users (lab_id) WHERE pending_approval;
