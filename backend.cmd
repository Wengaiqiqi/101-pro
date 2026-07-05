@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion
set "APP_NAME=W&W刷题"
title !APP_NAME! - Backend
cd /d "%~dp0backend"
echo.
echo  [!APP_NAME!] Starting FastAPI backend...
echo  [!APP_NAME!] Backend:  http://127.0.0.1:8000
echo  [!APP_NAME!] API Docs: http://127.0.0.1:8000/docs
echo.
python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
echo.
echo  [!APP_NAME!] Backend stopped.
pause
