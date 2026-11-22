@echo off
setlocal
title VN crochet - Local Server
cd /d "%~dp0"

echo.
echo  =============================================
echo    VN crochet - Starting Website + Admin
echo  =============================================
echo.

where node >nul 2>&1
if errorlevel 1 (
  echo  [!] Node.js was not found on this PC.
  where python >nul 2>&1
  if errorlevel 1 (
    echo  [!] Python was also not found.
    echo      Please install Node.js from https://nodejs.org/
    pause
    exit /b 1
  )
  echo  [*] Starting static preview with Python ^(Admin save needs Node.js^)...
  python main.py
  exit /b 0
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

rem Check if port 3000 is already listening so we don't spawn a duplicate server
netstat -ano | findstr ":3000 " | findstr "LISTENING" >nul 2>&1
if not errorlevel 1 (
  echo  [OK] Server is already running on http://localhost:3000
  start "" "http://localhost:3000"
  echo.
  echo  Shop  : http://localhost:3000
  echo  Admin : http://localhost:3000/admin/
  echo.
  timeout /t 3 >nul
  exit /b 0
)

echo  [*] Launching local server on http://localhost:3000 ...
echo      Shop  : http://localhost:3000
echo      Admin : http://localhost:3000/admin/
echo.
echo  Keep this window open while using the website. Press Ctrl+C to stop.
echo.

start "" cmd /c "timeout /t 2 /nobreak >nul && start "" "http://localhost:3000""
node server.js
pause
