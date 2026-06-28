@echo off
title 101 Pro - Backend
cd /d "%~dp0backend"
echo.
echo  [101 Pro] Starting FastAPI backend...
echo  [101 Pro] Backend:  http://127.0.0.1:8000
echo  [101 Pro] API Docs: http://127.0.0.1:8000/docs
echo.
python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
echo.
echo  [101 Pro] Backend stopped.
pause
