# Merge Checklist — دمج فرع "الصلاحيات + Google Drive" في هذه النسخة

هذه النسخة أساسها الفرع **الأمني/الإنتاجي** (نفس اللي شغال دلوقتي على GitHub/Vercel
حسب تأكيدك)، وفيه بالفعل:

- ✅ إصلاح الحسابات اليتيمة (`deleteAuthUser`)
- ✅ سياسة كلمات مرور موحّدة (`password-policy.ts`)
- ✅ سجل تدقيق (`audit.ts`)، health check، logger موحّد
- ✅ نسخ احتياطي (`backup-db.mjs` / `restore-db.mjs`)
- ✅ تصدير PDF حقيقي (`generate-report-pdf.ts`)

**تمت إضافته الآن كملفات مستقلة (كود جاهز، لسه مش متوصّل بحاجة):**
- `src/lib/storage/*.ts` (Google Drive: types, permissions helper, drive client, storage orchestration)
- `src/routes/api/google-drive/{connect,callback}.ts` (OAuth flow)
- `migrations/0006_lab_user_permissions.sql` (صلاحيات مفصّلة لكل عضو فريق)
- `migrations/0007_lab_drive_storage.sql` (جدول ربط كل معمل بمجلدات Drive)
- متغيرات البيئة الخاصة بيها كانت موجودة بالفعل في `.env.example`
- **لا توجد مكتبات npm جديدة مطلوبة** — كود Drive بيستخدم `fetch` مباشرة على REST API بتاع جوجل، مش حزمة `googleapis`.

هذه الملفات وحدها **لا تكسر أي بناء** (build) لأنها غير مستخدمة حاليًا من أي
مكان. لكن الميزة مش شغالة فعليًا للمستخدم لحد ما تتم الخطوات التالية —
وهي التي تحتاج **قرار ومراجعة بشرية/Grok مع compiler حقيقي**، مش دمج نص أعمى:

---

## 1. `src/lib/platform-admin.ts` — دمج حقيقي مطلوب
- **حافظ عليه من هذه النسخة:** `deleteAuthUser`, `deleteSelfIfOrphaned`, `platformAdminExists` (إصلاح الحسابات اليتيمة — أهم إصلاح أمني في المشروع).
- **أضف من فرع Drive:** `deleteAdminLab`, `disableAdminLab`, `enableAdminLab`, `updateAdminLab` (دورة حياة المعمل من لوحة الأدمن) + استدعاء `ensureLabDriveFolders` عند إنشاء معمل جديد.
- **مهم:** أي دالة حذف/تعطيل معمل جديدة يجب أن تمرّ بنفس منطق تنظيف الحسابات اليتيمة (`deleteAuthUser`) بدل ما تتجاهله.

## 2. `src/lib/lab-users.ts` — إعادة هيكلة الصلاحيات
- **حافظ عليه:** `deleteAuthUser`، النوع البسيط `LabRole` كـ fallback إذا حبيت تدرّج الانتقال.
- **أضف:** نظام الصلاحيات المفصّل بالكامل — `ALL_LAB_PERMISSIONS`, `requireLabPermission`, `getCurrentLabPermissions`, `getLabUserContext`, `getManagerContext`.
- **قرار مطلوب منك:** هل تستبدل `LabRole` (owner/technician/reviewer/viewer) بالكامل بنظام الصلاحيات الجديد، ولا تخليهم يتعايشوا (الدور الأساسي + صلاحيات إضافية فوقه)؟ فرع Drive مبني على الاستبدال الكامل.

## 3. `src/lib/lab-reports.ts` — أكبر فرق (1860 سطر)
- **ميزة جديدة حقيقية في فرع Drive:** `deleteLabReport` — مش موجودة في النسخة الحالية خالص. تستاهل تتضاف بغض النظر عن Drive.
- باقي الفروقات الكبيرة غالبًا reformatting (توزيع باراميترات الدوال على أسطر متعددة) — يحتاج مراجعة سطر بسطر مش تخمين.
- تأكد إن أي دالة تقرير جديدة/معدّلة بتحترم صلاحيات `requireLabPermission` الجديدة بدل الفحص القديم بالدور فقط.

## 4. `src/lib/patients.ts`
- فرع Drive بيضيف `savePatientToDrive` بعد إنشاء/تعديل المريض، وعمود `drive_file_id` في قاعدة البيانات (تأكد إنه موجود في migration 0007 أو أضفه).
- دمج مباشر نسبيًا: أضف استدعاء `savePatientToDrive` + تحديث الحقل بعد نجاح كتابة قاعدة البيانات الأساسية (Drive يكون طبقة تانية اختيارية، مش نقطة فشل حرجة — لاحظ إن الكود الأصلي بيعمل `catch` لأخطاء Drive من غير ما يفشل العملية الأساسية، حافظ على نفس المبدأ).

## 5. `src/routes/admin.users.tsx` و `src/routes/team.tsx`
- فرع Drive بيضيف UI كامل لتحرير الصلاحيات: `PermissionRow`, `PermissionEditor`, `PermissionGroup`, `Stat`, `assertPlatformAdmin`.
- دول شاشات كاملة جديدة تعتمد على نظام الصلاحيات من بند 2 — لازم تتدمج **بعد** ما تحسم قرار الصلاحيات، مش قبله.

## 6. `src/routes/admin.labs.tsx`
- إضافة أزرار/شاشات لتفعيل وتعطيل وحذف وتعديل معمل من لوحة الأدمن (مرتبطة بالدوال في بند 1).

## 7. `src/routes/settings.tsx`
- ميزة صغيرة مستقلة نسبيًا: `compressLogo()` — ضغط صورة لوجو المعمل قبل الرفع. آمنة الدمج، وغالبًا فيها زر ربط Google Drive للمعمل.

## 8. `src/lib/lab-catalog.ts` (فرق بسيط)
- دالة `getLabUserId` القديمة اتستبدلت بـ helper من نظام الصلاحيات الجديد — تعديل بسيط بعد ما يتحسم بند 2.

## 9. ملفات بدون فروقات جوهرية (اطمئن، مش محتاجة حاجة)
`src/routes/login.tsx`, `src/routes/patients.tsx`, `src/lib/store.ts`,
`src/lib/auth/use-current-user.ts`, `src/components/report/wizard.tsx`,
`src/components/report/print-view.tsx` — متطابقة أو فروقات تنسيق فقط.

---

## خطوات التنفيذ الموصى بها
1. اديله ده (المستند ده) + نسخة `src/` من الفرع التاني (Google Drive) لنفس بيئة Grok App Builder اللي بنت المشروع.
2. اطلب دمج البنود 1→8 بالترتيب ده تحديدًا (كل بند بعد ما يتأكد اللي قبله شغال).
3. بعد كل بند: `npm run typecheck && npm test`.
4. قبل أي نشر نهائي: `npm install && npm run typecheck && npm run lint && npm test && npm run build` (زي ما `PRODUCTION_READINESS.md` بيوصّي أصلاً).
5. جرّب فعليًا: تسجيل دخول، إنشاء تقرير، حذف تقرير (الميزة الجديدة)، ربط Google Drive لمعمل تجريبي، تعديل صلاحيات عضو فريق — قبل ما تعتبرها جاهزة.

هذا المستند مبني على فحص نصي دقيق للفروقات بدون تشغيل compiler أو قاعدة بيانات
حقيقية (البيئة اللي أنا شغال فيها من غير إنترنت) — يعني هو **خريطة دقيقة لللي
يحتاج دمج**، مش دمج تم اختباره فعليًا.
