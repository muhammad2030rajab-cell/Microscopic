# تنظيف كل ما يخص Grok — ملخص التغييرات

هذه النسخة اتشالت منها كل أدوات ومنصة Grok App Builder، والتطبيق دلوقتي
مستقل بالكامل: تسجيل دخول محلي بالإيميل/الباسورد فقط، ونشر مباشر على Vercel
من غير أي اعتماد على منصة Grok أو broker خاص بيهم.

## ملفات اتشالت بالكامل (أدوات/منصة، من غير أي تأثير على شغل التطبيق)
- `.grok/` (كل الملف — skills وتعليمات الـ agent، مش كود تطبيق)
- `AGENTS.md`
- `public/__grok/` (أصول بانر تثبيت PWA بتاع Grok)
- `server/` (middleware و type declaration خاصين ببانر PWA بتاع Grok)
- `scripts/grok-pwa-plugin.mjs` + الاختبار + `grok-pwa-shared.mjs`
- `scripts/brand-check.mjs` + الاختبار (كان بيتأكد من وجود صورة مشاركة مخصصة بدل بلاسيهولدر `og.grok.me`)
- `scripts/install-page.html` (صفحة "أضف للشاشة الرئيسية" بتاعة Grok)
- `scripts/preview.mjs`, `scripts/app-env-plugin.mjs`, `scripts/with-app-env.mjs` + اختباراتهم (أدوات بيئة المعاينة المحلية بتاعة Grok)
- `scripts/check-auth-invariant.mjs` + الاختبار
- `scripts/write-atomic.mjs` + الاختبار (كان أداة مساندة لـ `capture-og.mjs` اللي اتشال معاه)
- `scripts/sign-out-plan.mjs` + الاختبار (كان جزء من منطق تسجيل الخروج المعقّد بتاع المعاينة الحية — بقى غير ضروري بعد التبسيط)
- `src/lib/app-data/` (نظام "connectors" بتاع منصة Grok — **لم يكن مستخدمًا في أي مكان بالتطبيق أصلاً**، كود ميت بالكامل)
- `src/lib/preview-host-bridge.ts`, `src/components/preview-host-bridge.tsx`, `src/lib/preview-embedder-origin.ts` (جسر عرض التطبيق جوه iframe منصة Grok)
- `src/lib/auth/gate-identity.server.ts` + الاختبار, `gate-session.server.ts`, `gate-session-marker.ts`, `popup.server.ts`, `preview.ts`, `providers.ts` (منظومة "تسجيل الدخول بـ Grok" الفيدرالي بالكامل — OAuth broker + JWT gate identity + نافذة popup + مفتاح سري كان متسرّب في الكود)
- `src/lib/og/site.json` (بيانات مرتبطة بأدوات محذوفة فقط)

## ملفات اتعدّلت (كود أساسي، اتشال منه جزء Grok وسابين الباقي شغال)
- **`src/lib/auth/server.ts`** — أعيدت كتابته من غير: OAuth federation لـ broker جروك، gate identity plugin، أسرار المعاينة الحية. باقي: Better Auth عادي بإيميل/باسورد + Postgres/PGLite. أسماء الكوكيز اتغيّرت من `__Host-grok-auth.*` لـ `__Host-app-auth.*` — **ده معناه أي جلسة مسجّل دخول بيها حاليًا هتتلغي أول ما تنزل النسخة دي (لازم تسجّل دخول تاني، طبيعي ومتوقع).**
- **`src/lib/auth/client.ts`** — أعيد كتابته: شيل كود الـ popup والـ bearer token والمعاينة الحية بالكامل، سايب فقط عميل Better Auth عادي + `signOut()`.
- **`src/lib/auth/gates.tsx`** — شيل زرار "Continue with Google/X" (مكنش مستخدم أصلاً — صفحة `/login` عندها فورم إيميل/باسورد خاص بيها)، وشيل منطق "gate session marker".
- **`src/lib/auth/middleware.ts`** و **`verify.server.ts`** — شيل تمرير bearer token (مش محتاجينه من غير معاينة حية جوه iframe).
- **`src/lib/auth/isolation.server.ts`** — نفس الحماية الأمنية (فحص same-site) باقية زي ما هي، بس عدّلت التعليق بس (كان بيوصف تهديد `*.grok.me` تحديدًا).
- **`src/lib/env.server.ts`** — شيلت `isWorkspacePreview()` (كانت مستخدمة بس من الملفات المحذوفة).
- **`src/routes/__root.tsx`** — شيل `<PreviewHostBridge />`.
- **`vite.config.ts`** — شيل 3 plugins بتاعة Grok (`grokPwaPlugin`, `appEnvPlugin`, `authPopupPlugin`)، سايب فقط الأساسيات + `nitro({ preset: "vercel" })`.
- **`package.json`** — شيل الأوامر: `preview:restart`, `preview:stop`, `check:auth`؛ بسّطت `dev`/`build`/`preview` (Vite بيقرأ `.env` لوحده، مش محتاجين wrapper)؛ شيلت dependency `jose` (كانت مستخدمة بس لتحقق JWT بتاع gate identity)؛ غيّرت الاسم من `app-builder-workspace` لـ `rajab-diagnostics`.
- **`.env.example`** — شيلت متغيرات `GROK_AUTH_*` / `GROK_PROJECT_ID` / `GROK_GATE_ORIGIN`.
- **`.gitignore`**, **`tsconfig.json`** — تنظيف بسيط (تعليق، وإزالة مسار `server/` المحذوف من include).

## تصحيح: رجّعت ملف كان اتشال بالغلط
`.github/workflows/unpack.yml` كان اتشال في أول تنظيف على افتراض إنه خاص
بمنصة Grok — ده كان غلط مني، الملف ده **عام ومفيدلك فعليًا**: أي زيب بترفعه
لجذر الريبو، الـ workflow ده بيفكّه تلقائيًا ويعمل commit للمحتوى — يعني تقدر
ترفع الزيب ده مباشرة على GitHub بدل ما تفك الضغط يدوي. رجّعته زي ما هو.

## سيبتها زي ما هي عمدًا
- **`migrations/0001_auth.sql`** (والنسخة في `migrations/auth/`) — فيها سطر تعليق بس بيقول "Sign in with Grok"، بس دي **migration اتطبّقت غالبًا على قاعدة بياناتك الحقيقية بالفعل**، وتعديل ملف migration بعد تطبيقه ممارسة خطرة (ممكن يعمل تعارض في تتبع الإصدارات). التعليق مش بيأثر على أي وظيفة، فسبته عمدًا.
- **`reference-drive-branch/`** — لسه فيها كود قديم بيشير لـ Grok (لأنه مرجع من الفرع التاني، زي ما اتفقنا في الرسالة اللي فاتت). مش جزء من التطبيق الفعلي (مش داخل `src/` اللي بيتبني)، فمفيش خطر منها — بس لو مش محتاجها تقدر تمسحها بعد ما تخلص دمج الصلاحيات من `MERGE_CHECKLIST.md`.

## قبل النشر على Vercel — لازم تعمل
```
npm install
npm run typecheck
npm run lint
npm test
npm run build
```
وبعدين جرّب يدويًا: تسجيل دخول admin، تسجيل دخول معمل، تسجيل خروج — لأن أسماء
كوكيز الجلسة اتغيّرت، والجلسات الحالية (لو فيه حد مسجل دخول دلوقتي) هتتلغي.

هذا التنظيف اتعمل بمراجعة نصية دقيقة لكل ملف وكل استيراد (مفيش أي import
معلّق أو ملف ناقص بعد الحذف — اتفحص بالكامل)، لكن **من غير تشغيل compiler أو
قاعدة بيانات حقيقية** (البيئة دي من غير إنترنت)، فالخطوات اللي فوق مش اختيارية.
