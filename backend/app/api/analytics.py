import logging

from fastapi import APIRouter, Depends
from app.core.security import get_current_user
from app.core.supabase import supabase

router = APIRouter()
logger = logging.getLogger(__name__)

@router.get("/cost-summary")
def cost_summary(user=Depends(get_current_user)):
    try:
        res = supabase.rpc("audit_cost_summary").execute()
        return res.data or {
            "total_cost": 0,
            "total_calls": 0,
            "avg_latency": 0,
        }
    except Exception:
        logger.exception("Failed to load analytics cost summary")
        return {
            "total_cost": 0,
            "total_calls": 0,
            "avg_latency": 0,
            "fallback": True,
        }

@router.get("/routing")
def routing_breakdown(user=Depends(get_current_user)):
    try:
        res = (supabase.table("audit_logs")
               .select("model_used, provider, cost_usd, latency_ms, created_at")
               .order("created_at", desc=True).limit(100).execute())
        return res.data or []
    except Exception:
        logger.exception("Failed to load analytics routing logs")
        return []
