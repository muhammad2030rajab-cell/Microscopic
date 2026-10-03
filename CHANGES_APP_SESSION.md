# تعديلات جلسة الأندرويد/الأوفلاين/الدخول

- `src/routes/login.tsx`: الدخول يستبدل الصفحة (replace) بدل ما يضيف عليها، وتحويل تلقائي لو المستخدم مسجّل أصلاً، ومهلة 20 ثانية + رسالة خطأ بدل التعليق.
- `src/lib/db.ts`: مهلات لـ pg Pool (اتصال/خمول/استعلام) + معالج أخطاء للاتصال الخامل.
- `public/offline.html`: الزرار يظهر فقط لو صفحة `/new` محفوظة، وإعادة تحميل تلقائية لما النت يرجع.
- `public/sw.js`: `VERSION` من v1 إلى v2 (لتحديث الكاش).
- `public/manifest.webmanifest`: أيقونات maskable + ar/rtl.
- `public/icon-maskable-192.png` و`public/icon-maskable-512.png`: جديدة.
- `public/.well-known/assetlinks.json`: ربط تطبيق الأندرويد (app.vercel.microscopic.twa) بالدومين.

لازم قبل الاعتماد: npm install && npm run typecheck && npm test && npm run build

## إيقاف الحساب + تواصل واتساب
- `src/lib/lab-access.ts`: `getCurrentAccess` بترجع `{ type: "suspended" }` لو المستخدم أو المعمل موقوف.
- `src/routes/login.tsx`: رسالة "تم إيقاف هذا الحساب. برجاء التواصل مع المدير." + زرار "تواصل معي عبر WhatsApp" (رابط wa.me مباشر بدون نص جاهز).
- `src/routes/index.tsx` و`src/routes/lab.tsx`: لو الحساب اتوقف وهو داخل، يتحوّل لصفحة الدخول وتظهر الرسالة.

## رسائل خطأ الدخول
- `src/lib/account-check.ts` (جديد): `accountExists` بتتنادى بعد فشل الدخول فقط، بسقف 60 فحص/دقيقة لكل نسخة سيرفر.
- `src/routes/login.tsx`: "لا يوجد حساب بهذا الاسم/البريد" لو الحساب مش موجود، و"كلمة المرور غير صحيحة" لو موجود.
