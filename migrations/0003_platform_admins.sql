CREATE TABLE IF NOT EXISTS platform_admins (
  auth_user_id TEXT PRIMARY KEY REFERENCES "user"(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_platform_admins_created_at
  ON platform_admins(created_at);
