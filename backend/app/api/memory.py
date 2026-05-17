from fastapi import APIRouter, Depends
from pydantic import BaseModel
from app.core.security import get_current_user
from app.services.hindsight_service import hindsight
from app.services.cascade_service import cascade
from app.prompts.retrieval import RETRIEVAL_SYSTEM, build_retrieval_prompt
from app.core.supabase import supabase

router = APIRouter()

class AskIn(BaseModel):
    patient_id: str
    question: str

@router.post("/ask")
def ask(body: AskIn, user=Depends(get_current_user)):
    # Resolve department
    prof = supabase.table("profiles").select("department").eq("id", user["id"]).single().execute().data
    dept = prof["department"]

    # Retrieve memories
    memories = hindsight.retrieve(
        query=body.question,
        patient_id=body.patient_id,
        department=dept,
        top_k=6,
    )

    # Generate response
    prompt = build_retrieval_prompt(body.question, memories, dept)
    response = cascade.run(
        system=RETRIEVAL_SYSTEM,
        user=prompt,
        user_id=user["id"],
        patient_id=body.patient_id,
        action="ask",
    )

    return {"response": response, "memories": memories}

@router.get("/timeline/{patient_id}")
def timeline(patient_id: str, user=Depends(get_current_user)):
    return hindsight.patient_timeline(patient_id, limit=50)