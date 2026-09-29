-- مرفقات التقارير (صور/سكانات مستندات أصلية) مخزّنة في Vercel Blob،
-- وده الجدول بيحفظ الرابط والبيانات الوصفية بس، مش الملف نفسه.
CREATE TABLE IF NOT EXISTS report_attachments (
  id TEXT PRIMARY KEY,
  report_id TEXT NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  lab_id TEXT NOT NULL REFERENCES labs(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  url TEXT NOT NULL,
  content_type TEXT,
  size_bytes INTEGER,
  uploaded_by TEXT REFERENCES lab_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_report_attachments_report ON report_attachments(report_id);
