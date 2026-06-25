# 101 Pro Question Bank Platform

Full-stack multi-user question bank platform with document import and LLM-assisted question generation.

## Local Services

```powershell
docker compose up -d postgres redis
```

## Backend

```powershell
cd backend
python -m pip install -e ".[dev]"
python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

## Frontend

```powershell
cd frontend
npm install
npm run dev
```

## Tests

```powershell
npm test
```
