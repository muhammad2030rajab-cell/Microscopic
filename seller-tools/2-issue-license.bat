@echo off
chcp 65001 >nul
cd /d "%~dp0.."
echo.
set /p DEVICE=رقم جهاز العميل (مثل A1B2-C3D4-E5F6-7890): 
set /p NOTE=اسم العميل او المعمل: 
echo.
node --experimental-strip-types scripts\license-tool.ts issue --device "%DEVICE%" --note "%NOTE%"
echo.
echo  ابعت الكود ده للعميل (انسخه كامل).
pause
