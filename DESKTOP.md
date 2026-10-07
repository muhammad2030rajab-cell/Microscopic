# نسخة ويندوز (.exe)

## بناء الـ exe (مرة واحدة، على GitHub)
1. ارفع الملفات دي على الريبو: `desktop/` و `.github/workflows/windows-exe.yml`.
2. GitHub > Actions > **Build Windows EXE** > Run workflow.
3. استنى حوالي 10 دقايق. بعدها من صفحة **Releases** (الوسم `windows-latest`) نزّل:
   - `Microscopic-1.0.0-nsis.exe`: مثبّت عادي بأيقونة.
   - `Microscopic-1.0.0-portable.exe`: يشتغل من غير تثبيت.

## التشغيل
دوس على الأيقونة: البرنامج بيفتح في نافذته. من قايمة Microscopic فيه **ربط الموبايل** و **فتح مجلد البيانات**.
البيانات في `%USERPROFILE%\MicroscopicHub` (خد منه نسخة احتياطية). التفاصيل في `HUB.md`.

## ملاحظات
- ويندوز ممكن يظهر تحذير SmartScreen لأن الملف مش موقّع. اختار «More info» ثم «Run anyway».
- المرفقات (صور/ملفات التقارير) لسه محتاجة تخزين محلي، زي ما مكتوب في `HUB.md`.
- لازم الإصلاح اللي عملناه في `platform-admin` يكون مرفوع، وإلا `npm run hub:build` هيفشل بنفس الخطأ.
