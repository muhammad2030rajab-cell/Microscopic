-- Flexible per-user permissions for laboratory staff.
-- Owner accounts keep full access in the server authorization layer.

ALTER TABLE lab_users
  DROP CONSTRAINT IF EXISTS lab_users_role_check;

ALTER TABLE lab_users
  ADD CONSTRAINT lab_users_role_check
  CHECK (role IN ('owner', 'supervisor', 'technician', 'reviewer', 'viewer'));

CREATE TABLE IF NOT EXISTS lab_user_permissions (
  lab_user_id TEXT PRIMARY KEY REFERENCES lab_users(id) ON DELETE CASCADE,
  permissions JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS lab_user_permissions_updated_at_idx
  ON lab_user_permissions(updated_at);

INSERT INTO lab_user_permissions (lab_user_id, permissions)
SELECT id, '{}'::jsonb
FROM lab_users
WHERE role <> 'owner'
ON CONFLICT (lab_user_id) DO NOTHING;
