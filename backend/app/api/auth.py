from fastapi import APIRouter, Depends
from pydantic import BaseModel
from app.core.security import get_current_user
from app.core.supabase import supabase

router = APIRouter()

class ProfileIn(BaseModel):
    full_name: str
    role: str
    department: str

@router.post("/profile")
def create_profile(body: ProfileIn, user=Depends(get_current_user)):
    res = supabase.table("profiles").upsert({
        "id": user["id"],
        "full_name": body.full_name,
        "role": body.role,
        "department": body.department,
    }).execute()
    data = getattr(res, "data", None) or []
    return data[0] if data else {"id": user["id"], **body.model_dump()}

@router.get("/me")
def me(user=Depends(get_current_user)):
    res = supabase.table("profiles").select("*").eq("id", user["id"]).maybe_single().execute()
    data = getattr(res, "data", None)
    if data:
        return data
    fallback = {
        "id": user["id"],
        "full_name": user.get("email") or "ShiftBrain Doctor",
        "role": "incoming_doctor",
        "department": "icu",
    }
    inserted = supabase.table("profiles").upsert(fallback).execute()
    rows = getattr(inserted, "data", None) or []
    return rows[0] if rows else fallback
