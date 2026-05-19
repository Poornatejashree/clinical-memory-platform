import logging

from fastapi import APIRouter, Depends
from app.core.security import get_current_user
from app.core.supabase import supabase

router = APIRouter()
logger = logging.getLogger(__name__)

@router.get("/")
def list_alerts(user=Depends(get_current_user)):
    try:
        prof = (
            supabase.table("profiles")
            .select("department")
            .eq("id", user["id"])
            .maybe_single()
            .execute()
            .data
        )
        if not prof:
            return []

        res = (supabase.table("alerts")
               .select("*, patients!inner(name, department, bed)")
               .eq("patients.department", prof["department"])
               .eq("acknowledged", False)
               .order("created_at", desc=True).execute())
        return res.data or []
    except Exception:
        logger.exception("Failed to load alerts")
        return []

@router.post("/{alert_id}/ack")
def ack_alert(alert_id: str, user=Depends(get_current_user)):
    try:
        supabase.table("alerts").update({
            "acknowledged": True, "acknowledged_by": user["id"]
        }).eq("id", alert_id).execute()
        return {"ok": True}
    except Exception:
        logger.exception("Failed to acknowledge alert %s", alert_id)
        return {"ok": False, "error": "Alert could not be acknowledged."}
