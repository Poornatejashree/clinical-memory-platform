# ShiftBrain Quickstart

Run the backend and frontend in two separate terminals.

Backend:

```bash
cd backend
uvicorn app.main:app --reload
```

The backend should be available at:

```text
http://localhost:8000
```

Frontend:

```bash
cd frontend
npm run dev
```

The frontend should be available at:

```text
http://localhost:3000
```

Required frontend environment variables:

```text
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
NEXT_PUBLIC_API_URL=http://localhost:8000
```

Required backend environment variables:

```text
SUPABASE_URL=
SUPABASE_SERVICE_KEY=
SUPABASE_JWT_SECRET=
GROQ_API_KEY=
OPENAI_API_KEY=
OPENROUTER_API_KEY=
CORS_ORIGINS=http://localhost:3000
```

Health checks:

```text
http://localhost:8000/api/health
http://localhost:8000/api/health/db
```

If the frontend says the backend is not running, start FastAPI on port 8000 and refresh the page.
