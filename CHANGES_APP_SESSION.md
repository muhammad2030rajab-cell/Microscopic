# تعديلات جلسة الأندرويد/الأوفلاين/الدخول

- `src/routes/login.tsx`: الدخول يستبدل الصفحة (replace) بدل ما يضيف عليها، وتحويل تلقائي لو المستخدم مسجّل أصلاً، ومهلة 20 ثانية + رسالة خطأ بدل التعليق.
- `src/lib/db.ts`: مهلات لـ pg Pool (اتصال/خمول/استعلام) + معالج أخطاء للاتصال الخامل.
- `public/offline.html`: الزرار يظهر فقط لو صفحة `/new` محفوظة، وإعادة تحميل تلقائية لما النت يرجع.
- `public/sw.js`: `VERSION` من v1 إلى v2 (لتحديث الكاش).
- `public/manifest.webmanifest`: أيقونات maskable + ar/rtl.
- `public/icon-maskable-192.png` و`public/icon-maskable-512.png`: جديدة.
- `public/.well-known/assetlinks.json`: ربط تطبيق الأندرويد (app.vercel.microscopic.twa) بالدومين.

لازم قبل الاعتماد: npm install && npm run typecheck && npm test && npm run build
