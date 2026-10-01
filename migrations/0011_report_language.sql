-- يسمح لكل معمل يختار شكل لغة تقريره: ثنائي اللغة (الوضع الحالي)، عربي بالكامل، أو إنجليزي بالكامل.
ALTER TABLE labs ADD COLUMN IF NOT EXISTS report_language TEXT NOT NULL DEFAULT 'bilingual';
ALTER TABLE labs ADD CONSTRAINT report_language_check CHECK (report_language IN ('bilingual', 'ar', 'en'));
