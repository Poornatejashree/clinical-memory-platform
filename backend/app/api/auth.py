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
    return res.data[0]

@router.get("/me")
def me(user=Depends(get_current_user)):
    res = supabase.table("profiles").select("*").eq("id", user["id"]).single().execute()
    return res.data