from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from app.core.security import get_current_user
from app.core.supabase import supabase
from app.services.extraction_service import extractor

router = APIRouter()

class HandoffIn(BaseModel):
    patient_id: str
    transcript: str
    department: str
    shift_type: str | None = "day"

@router.post("/")
def create_handoff(body: HandoffIn, user=Depends(get_current_user)):
    # Insert handoff record
    h = supabase.table("handoffs").insert({
        "patient_id": body.patient_id,
        "outgoing_doctor_id": user["id"],
        "raw_transcript": body.transcript,
        "department": body.department,
        "shift_type": body.shift_type,
    }).execute().data[0]

    # Run extraction (cascadeflow + Hindsight)
    extraction = extractor.extract_handoff(
        transcript=body.transcript,
        department=body.department,
        patient_id=body.patient_id,
        author_id=user["id"],
        handoff_id=h["id"],
    )

    # Timeline event
    supabase.table("timeline_events").insert({
        "patient_id": body.patient_id,
        "event_type": "handoff",
        "title": "Shift handoff recorded",
        "description": extraction.get("structured_summary", {}).get("plan", "")[:200],
        "actor_id": user["id"],
        "ref_id": h["id"],
    }).execute()

    return {"handoff_id": h["id"], "extraction": extraction}

@router.get("/patient/{patient_id}")
def list_for_patient(patient_id: str, user=Depends(get_current_user)):
    res = (supabase.table("handoffs").select("*")
           .eq("patient_id", patient_id)
           .order("created_at", desc=True).execute())
    return res.data