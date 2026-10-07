@echo off
chcp 65001 >nul
cd /d "%~dp0.."
echo.
node --experimental-strip-types scripts\license-tool.ts list
echo.
pause
