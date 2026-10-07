@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo === First time setup (run this ONCE on YOUR computer) ===
echo.
call npm install
echo.
call npm run license -- keygen
echo.
echo IMPORTANT: copy the private key file shown above (license-private.pem) to a USB drive. Never send it to anyone.
echo.
set /p SITE=Your cloud site address (example https://my-labs.vercel.app). Press Enter to skip: 
if not "%SITE%"=="" call npm run license -- server %SITE%
echo.
call npm run -s license -- show-private | clip
echo The private key was COPIED to your clipboard. Paste it NOW into your cloud site settings as LICENSE_PRIVATE_KEY (see LICENSE-KEYS.md, step "cloud site"). Do not paste it anywhere else.
echo.
pause
