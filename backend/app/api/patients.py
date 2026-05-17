from fastapi import APIRouter, Depends
from app.core.security import get_current_user
from app.core.supabase import supabase

router = APIRouter()

@router.get("/")
def list_patients(user=Depends(get_current_user)):
    prof = supabase.table("profiles").select("department").eq("id", user["id"]).single().execute().data
    res = (supabase.table("patients").select("*")
           .eq("department", prof["department"])
           .order("admission_date", desc=True).execute())
    return res.data

@router.get("/{patient_id}")
def get_patient(patient_id: str, user=Depends(get_current_user)):
    p = supabase.table("patients").select("*").eq("id", patient_id).single().execute().data
    alerts = (supabase.table("alerts").select("*")
              .eq("patient_id", patient_id).eq("acknowledged", False)
              .order("created_at", desc=True).execute()).data
    return {**p, "open_alerts": alerts}