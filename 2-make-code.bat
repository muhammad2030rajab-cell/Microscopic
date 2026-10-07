@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo === Make an activation code for a customer ===
echo.
set /p MID=Paste the customer machine id (like ABCD-EF01-2345-6789): 
set /p NAME=Lab name (for your own list): 
echo.
call npm run license -- issue --machine "%MID%" --note "%NAME%" > "%TEMP%\rjb-code.txt"
type "%TEMP%\rjb-code.txt"
findstr /b "RJB-" "%TEMP%\rjb-code.txt" | clip
echo.
echo If you see a code above, it is already COPIED. Just paste it in WhatsApp to the customer.
echo.
pause
