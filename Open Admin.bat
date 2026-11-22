@echo off
setlocal
title VN crochet - Studio Admin Desk
cd /d "%~dp0"

echo.
echo  =============================================
echo    VN crochet - Opening Admin Studio Desk
echo  =============================================
echo.

where node >nul 2>&1
if errorlevel 1 (
  echo  [!] Node.js is required to run the Admin Studio Desk.
  echo      Install Node.js LTS from https://nodejs.org/ and double-click this file again.
  pause
  exit /b 1
)

if not exist "node_modules\express" (
  echo  [*] Installing required packages ^(first time only^)...
  call npm install
  if errorlevel 1 (
    echo  [!] npm install failed. Check your internet connection and try again.
    pause
    exit /b 1
  )
)

netstat -ano | findstr ":3000 " | findstr "LISTENING" >nul 2>&1
if not errorlevel 1 (
  echo  [OK] Server is already running. Opening Admin Desk...
  start "" "http://localhost:3000/admin/"
  timeout /t 2 >nul
  exit /b 0
)

echo  [*] Starting server and opening http://localhost:3000/admin/ ...
echo  Keep this window open while editing products. Press Ctrl+C to stop.
echo.

start "" cmd /c "timeout /t 2 /nobreak >nul && start "" "http://localhost:3000/admin/""
node server.js
pause
