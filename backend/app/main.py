from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config import settings
from app.api import auth, patients, handoffs, memory, alerts, analytics, voice, health, ai

app = FastAPI(title="ShiftBrain Clinical Handoff Memory Agent")

origins = [origin.strip() for origin in settings.CORS_ORIGINS.split(",") if origin.strip()]
for origin in ["http://localhost:3000", "http://127.0.0.1:3000"]:
    if origin not in origins:
        origins.append(origin)

# CORS — explicit, bulletproof for hackathon
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
app.include_router(patients.router, prefix="/api/patients", tags=["patients"])
app.include_router(handoffs.router, prefix="/api/handoffs", tags=["handoffs"])
app.include_router(memory.router, prefix="/api/memory", tags=["memory"])
app.include_router(alerts.router, prefix="/api/alerts", tags=["alerts"])
app.include_router(analytics.router, prefix="/api/analytics", tags=["analytics"])
app.include_router(voice.router, prefix="/api/voice", tags=["voice"])
app.include_router(health.router, prefix="/api/health", tags=["health"])
app.include_router(ai.router, prefix="/api/ai", tags=["ai"])

@app.get("/")
def root():
    return {"service": "shiftbrain", "status": "ok"}
