@echo off
chcp 65001 >nul
cd /d "%~dp0.."
echo.
echo  مرة واحدة بس: إنشاء مفتاحك الخاص.
echo  (لو اتعمل قبل كده هيرفض، وده المطلوب. متستخدمش --force غير لو متأكد)
echo.
node --experimental-strip-types scripts\license-tool.ts keygen
echo.
pause
