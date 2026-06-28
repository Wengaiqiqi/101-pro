@echo off
title 101 Pro - Frontend
cd /d "%~dp0frontend"
echo.
echo  [101 Pro] Starting Vite frontend...
echo  [101 Pro] Frontend: http://127.0.0.1:5173
echo.
npm run dev -- --host 127.0.0.1 --port 5173
echo.
echo  [101 Pro] Frontend stopped.
pause
