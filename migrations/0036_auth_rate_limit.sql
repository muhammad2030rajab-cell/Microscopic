-- عدّاد محاولات الدخول (Better Auth rate limit) على Postgres المشترك.
-- بيمنع تخمين كلمات المرور: بعد عدد محاولات في فترة بيرجع 429.
-- الاسم والأعمدة (camelCase بين علامتي تنصيص) هي اللي Better Auth بيدوّر عليها.
CREATE TABLE IF NOT EXISTS "rateLimit" (
  "id" text NOT NULL PRIMARY KEY,
  "key" text NOT NULL UNIQUE,
  "count" integer NOT NULL,
  "lastRequest" bigint NOT NULL
);
