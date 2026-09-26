-- يضيف صلاحيات دقيقة لكل مدير منصة على حدة، بنفس فكرة lab_user_permissions،
-- بالإضافة إلى إمكانية إيقاف مدير أو معمل بدل ما يكون الخيار الوحيد هو الحذف.

ALTER TABLE platform_admins ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE platform_admins ADD COLUMN IF NOT EXISTS is_super BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE platform_admins ADD COLUMN IF NOT EXISTS created_by TEXT REFERENCES "user"(id) ON DELETE SET NULL;

-- أي مدير موجود بالفعل قبل هذا التحديث يبقى "مدير عام" كامل الصلاحيات تلقائيًا،
-- عشان محدش يفقد صلاحياته الحالية بسبب هذا التحديث.
UPDATE platform_admins SET is_super = TRUE WHERE is_super = FALSE;

CREATE TABLE IF NOT EXISTS platform_admin_permissions (
  admin_auth_user_id TEXT PRIMARY KEY REFERENCES platform_admins(auth_user_id) ON DELETE CASCADE,
  permissions JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
