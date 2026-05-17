from fastapi import APIRouter, Depends
from app.core.security import get_current_user
from app.core.supabase import supabase

router = APIRouter()

@router.get("/")
def list_alerts(user=Depends(get_current_user)):
    prof = supabase.table("profiles").select("department").eq("id", user["id"]).single().execute().data
    res = (supabase.table("alerts")
           .select("*, patients!inner(name, department, bed)")
           .eq("patients.department", prof["department"])
           .eq("acknowledged", False)
           .order("created_at", desc=True).execute())
    return res.data

@router.post("/{alert_id}/ack")
def ack_alert(alert_id: str, user=Depends(get_current_user)):
    supabase.table("alerts").update({
        "acknowledged": True, "acknowledged_by": user["id"]
    }).eq("id", alert_id).execute()
    return {"ok": True}