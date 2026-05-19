import logging

from fastapi import APIRouter
from jose import jwt

from app.config import settings
from app.core.supabase import supabase

router = APIRouter()
logger = logging.getLogger(__name__)

def _key_role() -> str:
    try:
        claims = jwt.get_unverified_claims(settings.SUPABASE_SERVICE_KEY)
        return claims.get("role", "unknown")
    except Exception:
        return "unreadable"

def _error(exc: Exception) -> dict:
    return {
        "type": type(exc).__name__,
        "message": str(exc),
        "code": getattr(exc, "code", None),
        "details": getattr(exc, "details", None),
        "hint": getattr(exc, "hint", None),
    }

@router.get("/db")
def db_health():
    result = {
        "ok": False,
        "supabase_url_configured": bool(settings.SUPABASE_URL),
        "service_key_configured": bool(settings.SUPABASE_SERVICE_KEY),
        "service_key_role": _key_role(),
        "patients_table_access": False,
        "profiles_table_access": False,
        "patients_count": 0,
        "profiles_count": 0,
    }
    try:
        res = supabase.table("patients").select("id", count="exact").limit(1).execute()
        profiles = supabase.table("profiles").select("id", count="exact").limit(1).execute()
        result["ok"] = True
        result["patients_table_access"] = True
        result["profiles_table_access"] = True
        result["patients_count"] = res.count or 0
        result["profiles_count"] = profiles.count or 0
        return result
    except Exception as exc:
        err = _error(exc)
        logger.exception("Database health check failed. Supabase error=%s", err)
        result["error"] = err
        return result

@router.get("")
def health():
    return {
        "ok": True,
        "service": "shiftbrain",
        "supabase_url_configured": bool(settings.SUPABASE_URL),
        "service_key_configured": bool(settings.SUPABASE_SERVICE_KEY),
    }
