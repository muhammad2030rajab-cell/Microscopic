-- ملفات مرفقات التقارير في البرنامج المحلي (بدون إنترنت).
-- الملف نفسه بيتخزن هنا (base64) جوه قاعدة البيانات، فبيدخل تلقائيًا في النسخة الاحتياطية (.rjbak).
-- على السحابة المرفقات لسه على Vercel Blob، والجدول ده بيفضل فاضي.
CREATE TABLE IF NOT EXISTS report_attachment_files (
  attachment_id TEXT PRIMARY KEY REFERENCES report_attachments(id) ON DELETE CASCADE,
  data_base64 TEXT NOT NULL
);
