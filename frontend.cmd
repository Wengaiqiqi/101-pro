@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion
set "APP_NAME=W&W刷题"
title !APP_NAME! - Frontend
cd /d "%~dp0frontend"
echo.
echo  [!APP_NAME!] Starting Vite frontend...
echo  [!APP_NAME!] Frontend: http://127.0.0.1:5173
echo.
npm run dev -- --host 127.0.0.1 --port 5173
echo.
echo  [!APP_NAME!] Frontend stopped.
pause
