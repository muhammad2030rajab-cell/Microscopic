import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/**
 * كان ملف migration-plan.test.mjs بيستورد projectRoot من هنا، لكن الملف ده
 * نفسه كان ناقص من المشروع أصلًا — فكان أي تشغيل لـ `npm test` بيفشل فورًا
 * بخطأ "Cannot find module './with-app-env.mjs'" قبل ما يوصل لأي اختبار حقيقي.
 */
export function projectRoot() {
  return join(dirname(fileURLToPath(import.meta.url)), "..");
}
