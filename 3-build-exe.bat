@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo === Build the Windows program (.exe) for customers. Needs internet, takes 5-15 minutes. ===
echo.
call npm install --no-audit --no-fund || goto :fail
call npm run hub:build || goto :fail
if not exist desktop\hub-modules mkdir desktop\hub-modules
call npm install --prefix desktop\hub-modules --no-audit --no-fund qrcode@1.5.4 || goto :fail
cd desktop
call npm install --no-audit --no-fund || goto :fail
call npm run dist || goto :fail
cd ..
echo.
echo DONE. Your program is in the folder: desktop\dist
echo Give the customer the file named Microscopic-1.0.0-nsis.exe
start "" "desktop\dist"
pause
exit /b 0
:fail
echo.
echo SOMETHING FAILED. Send a screenshot of this window. If you see "symbolic link", right-click this file and choose "Run as administrator".
pause
exit /b 1
