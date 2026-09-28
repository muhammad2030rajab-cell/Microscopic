-- تاريخ سحب العينة، منفصل عن تاريخ إنشاء التقرير نفسه (ميزة كانت موجودة في نموذج LabPro التجريبي وناقصة هنا).
ALTER TABLE reports ADD COLUMN IF NOT EXISTS collected_at DATE;
