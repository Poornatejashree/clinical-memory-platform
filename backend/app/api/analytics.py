from fastapi import APIRouter, Depends
from app.core.security import get_current_user
from app.core.supabase import supabase

router = APIRouter()

@router.get("/cost-summary")
def cost_summary(user=Depends(get_current_user)):
    res = supabase.rpc("audit_cost_summary").execute()
    return res.data

@router.get("/routing")
def routing_breakdown(user=Depends(get_current_user)):
    res = (supabase.table("audit_logs")
           .select("model_used, cost_usd, latency_ms")
           .order("created_at", desc=True).limit(100).execute())
    return res.data