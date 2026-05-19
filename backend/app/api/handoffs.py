from datetime import datetime, timezone
import json
import logging

from fastapi import APIRouter, Depends, HTTPException
from groq import Groq
from pydantic import BaseModel
from app.config import settings
from app.core.security import get_current_user
from app.core.supabase import supabase
from app.services.extraction_service import extractor

router = APIRouter()
logger = logging.getLogger(__name__)

def _data(response, label: str):
    if response is None:
        logger.error("Supabase %s returned None response", label)
        raise HTTPException(502, {"message": f"Supabase {label} returned no response."})
    return getattr(response, "data", None)

class HandoffIn(BaseModel):
    patient_id: str
    transcript: str
    department: str
    shift_type: str | None = "day"
    patient_name: str | None = None
    formal_note: str | None = None
    gut_concern: str | None = None
    things_not_in_chart: str | None = None
    watch_outs: str | None = None
    doctor_name: str | None = None

class DraftIn(BaseModel):
    patient_id: str
    transcript: str
    previous_draft: dict | None = None

def _json_from_text(value: str) -> dict:
    try:
        return json.loads(value)
    except json.JSONDecodeError:
        start = value.find("{")
        end = value.rfind("}")
        if start >= 0 and end > start:
            return json.loads(value[start:end + 1])
        raise

def _normalize_draft(data: dict, transcript: str) -> dict:
    missing = data.get("missing_fields") or []
    followups = data.get("followup_questions") or []
    normalized = {
        "formal_note": data.get("formal_note") or "",
        "gut_concern": data.get("gut_concern") or "",
        "things_not_in_chart": data.get("things_not_in_chart") or "",
        "watch_outs": data.get("watch_outs") or "",
        "shift": data.get("shift") or "night",
        "missing_fields": missing,
        "followup_questions": followups,
        "suggested_followup_questions": followups,
        "raw_transcript": transcript,
    }
    for field, question in [
        ("formal_note", "What is the patient’s formal clinical status right now?"),
        ("gut_concern", "Any gut concern or bedside intuition the next doctor should know?"),
        ("watch_outs", "What should the incoming doctor check first?"),
    ]:
        if not normalized[field] and field not in normalized["missing_fields"]:
            normalized["missing_fields"].append(field)
        if not normalized[field] and question not in normalized["followup_questions"]:
            normalized["followup_questions"].append(question)
    normalized["followup_questions"] = normalized["followup_questions"][:2]
    normalized["suggested_followup_questions"] = normalized["followup_questions"]
    return normalized

def _fallback_draft(transcript: str, previous_draft: dict | None = None, warning: str | None = None) -> dict:
    previous_draft = previous_draft or {}
    lower = transcript.lower()

    formal = previous_draft.get("formal_note") or transcript[:350]
    gut = previous_draft.get("gut_concern") or ""
    missing = previous_draft.get("things_not_in_chart") or ""
    watch = previous_draft.get("watch_outs") or ""

    if not gut and any(term in lower for term in ["gut", "worried", "concern", "off", "quiet", "anxious"]):
        gut = transcript[:260]
    if not watch and any(term in lower for term in ["watch", "monitor", "check", "recheck", "overnight", "tonight"]):
        watch = transcript[:260]
    if not missing and any(term in lower for term in ["not in chart", "not charted", "family", "not documented"]):
        missing = transcript[:260]

    data = {
        "formal_note": formal,
        "gut_concern": gut,
        "things_not_in_chart": missing,
        "watch_outs": watch,
        "shift": previous_draft.get("shift") or ("night" if "night" in lower or "overnight" in lower else "day"),
        "missing_fields": [],
        "followup_questions": [],
        "_meta": {
            "provider": "local_fallback",
            "warning": warning or "Groq draft extraction was unavailable; generated editable draft locally.",
        },
    }
    return _normalize_draft(data, transcript)

def build_follow_up_questions(body: HandoffIn) -> list[str]:
    text = " ".join([
        body.transcript or "",
        body.formal_note or "",
        body.gut_concern or "",
        body.things_not_in_chart or "",
        body.watch_outs or "",
    ]).lower()

    questions = []
    if "anxious" in text or "quiet" in text:
        questions.append("You mentioned a behavior change. Is this new for the patient or typical for this admission?")
    if "bp" in text or "blood pressure" in text or "spike" in text:
        questions.append("You flagged a BP spike. Was anyone notified, and should the incoming doctor recheck it first?")
    if body.gut_concern:
        questions.append("Is this concern documented in the formal chart, or only from your observation?")
    if body.things_not_in_chart:
        questions.append("What missing chart context would be most dangerous for the incoming doctor to overlook?")
    if body.watch_outs:
        questions.append("What should the incoming doctor check first during the next bedside pass?")

    defaults = [
        "What should the incoming doctor check first?",
        "Is this concern documented in the formal chart or only from your observation?",
        "What would make you escalate overnight?",
        "Who already knows about this concern?",
    ]
    for question in defaults:
        if len(questions) >= 4:
            break
        if question not in questions:
            questions.append(question)

    return questions[:4]

@router.post("/extract-draft")
@router.post("/extract-draft/")
def extract_draft(body: DraftIn, user=Depends(get_current_user)):
    if not settings.GROQ_API_KEY:
        raise HTTPException(503, {"message": "GROQ_API_KEY is not configured."})
    if not body.transcript.strip():
        raise HTTPException(400, {"message": "Transcript is required."})

    try:
        try:
            patient_res = supabase.table("patients").select("name,department").eq("id", body.patient_id).maybe_single().execute()
            patient = getattr(patient_res, "data", None) or {}
        except Exception:
            logger.exception("Draft extraction patient lookup failed; continuing without patient context")
            patient = {}
        client = Groq(api_key=settings.GROQ_API_KEY)
        prompt = f"""Patient: {patient.get('name') or body.patient_id}
Department: {patient.get('department') or 'icu'}

Previous draft:
{json.dumps(body.previous_draft or {}, default=str)}

New transcript:
{body.transcript}

Extract or update a handoff draft for the outgoing doctor.
Return JSON only with:
{{
  "formal_note": "",
  "gut_concern": "",
  "things_not_in_chart": "",
  "watch_outs": "",
  "shift": "day|night|swing",
  "missing_fields": ["formal_note", "gut_concern", "watch_outs"],
  "followup_questions": ["one or two concise questions"]
}}
Keep field values concise and clinically useful. Preserve previous draft values unless the new transcript corrects them."""
        last_error = None
        for model in (settings.GROQ_MODEL, "llama-3.1-8b-instant", "llama-3.3-70b-versatile"):
            if not model:
                continue
            try:
                resp = client.chat.completions.create(
                    model=model,
                    messages=[
                        {"role": "system", "content": "You extract structured clinical handoff drafts. Return valid JSON only."},
                        {"role": "user", "content": prompt},
                    ],
                    temperature=0.15,
                    response_format={"type": "json_object"},
                )
                raw = resp.choices[0].message.content or "{}"
                draft = _normalize_draft(_json_from_text(raw), body.transcript)
                draft["_meta"] = {"provider": "groq", "model": model}
                return draft
            except Exception as exc:
                logger.exception("Draft extraction failed with model %s", model)
                last_error = exc
        return _fallback_draft(body.transcript, body.previous_draft, str(last_error))
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Failed to extract handoff draft")
        return _fallback_draft(body.transcript, body.previous_draft, str(exc))

@router.post("/")
@router.post("")
def create_handoff(body: HandoffIn, user=Depends(get_current_user)):
    profile = None
    try:
        profile = _data(
            supabase.table("profiles").select("full_name").eq("id", user["id"]).maybe_single().execute(),
            "handoff profile lookup",
        )
    except Exception:
        logger.exception("Could not load profile for handoff; using email fallback")
    doctor_name = body.doctor_name or profile.get("full_name") if profile else body.doctor_name
    doctor_name = doctor_name or user.get("email") or "Outgoing doctor"
    transcript_parts = [
        f"Patient: {body.patient_name}" if body.patient_name else "",
        f"Outgoing doctor: {doctor_name}" if doctor_name else "",
        f"Shift: {body.shift_type}" if body.shift_type else "",
        f"Formal handoff note: {body.formal_note}" if body.formal_note else "",
        f"Gut concern / clinical intuition: {body.gut_concern}" if body.gut_concern else "",
        f"Things not in chart: {body.things_not_in_chart}" if body.things_not_in_chart else "",
        f"Watch-outs tonight: {body.watch_outs}" if body.watch_outs else "",
        body.transcript or "",
    ]
    transcript = "\n".join([part for part in transcript_parts if part]).strip()

    # Insert handoff record
    try:
        inserted = _data(supabase.table("handoffs").insert({
            "patient_id": body.patient_id,
            "outgoing_doctor_id": user["id"],
            "raw_transcript": transcript or "No transcript provided.",
            "department": body.department,
            "shift_type": body.shift_type,
            "structured_summary": {
                "formal_note": body.formal_note,
                "gut_concern": body.gut_concern,
                "things_not_in_chart": body.things_not_in_chart,
                "watch_outs": body.watch_outs,
                "doctor_name": doctor_name,
                "shift": body.shift_type,
                "received": False,
            },
            "hidden_concerns": [{"concern": body.gut_concern, "doctor": doctor_name}] if body.gut_concern else [],
            "monitoring_priorities": [body.watch_outs] if body.watch_outs else [],
        }).execute(), "handoff insert")
        if not inserted:
            raise HTTPException(500, {"message": "Handoff insert returned no row."})
        h = inserted[0]
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Failed to save handoff")
        raise HTTPException(500, {"message": "Handoff could not be saved.", "error": str(exc)})

    # Run extraction when model services are available; keep handoff saving reliable without it.
    try:
        extraction = extractor.extract_handoff(
            transcript=transcript,
            department=body.department,
            patient_id=body.patient_id,
            author_id=user["id"],
            handoff_id=h["id"],
        )
    except Exception:
        extraction = {
            "structured_summary": {
                "formal_note": body.formal_note,
                "gut_concern": body.gut_concern,
                "things_not_in_chart": body.things_not_in_chart,
                "watch_outs": body.watch_outs,
                "doctor_name": doctor_name,
                "shift": body.shift_type,
            },
            "hidden_concerns": [{"concern": body.gut_concern, "doctor": doctor_name}] if body.gut_concern else [],
            "risks": [],
            "monitoring_priorities": [body.watch_outs] if body.watch_outs else [],
            "_meta": {"tier": "saved-without-extraction", "cost": 0, "latency_ms": 0},
        }
    extraction["follow_up_questions"] = build_follow_up_questions(body)
    stored_summary = {
        **(extraction.get("structured_summary") or {}),
        "formal_note": body.formal_note,
        "gut_concern": body.gut_concern,
        "things_not_in_chart": body.things_not_in_chart,
        "watch_outs": body.watch_outs,
        "doctor_name": doctor_name,
        "shift": body.shift_type,
        "received": False,
    }
    try:
        supabase.table("handoffs").update({
            "structured_summary": stored_summary,
            "hidden_concerns": [{"concern": body.gut_concern, "doctor": doctor_name}] if body.gut_concern else extraction.get("hidden_concerns", []),
            "monitoring_priorities": [body.watch_outs] if body.watch_outs else extraction.get("monitoring_priorities", []),
        }).eq("id", h["id"]).execute()
    except Exception:
        logger.exception("Failed to update handoff extraction fields")
    extraction["structured_summary"] = stored_summary

    # Timeline event
    try:
        supabase.table("timeline_events").insert({
            "patient_id": body.patient_id,
            "event_type": "handoff",
            "title": "Shift handoff recorded",
            "description": (body.watch_outs or body.formal_note or transcript)[:200],
            "actor_id": user["id"],
            "ref_id": h["id"],
        }).execute()
    except Exception:
        logger.exception("Failed to write handoff timeline event")

    return {
        "handoff_id": h["id"],
        "extraction": extraction,
        "follow_up_questions": extraction["follow_up_questions"],
    }

@router.get("/patient/{patient_id}")
def list_for_patient(patient_id: str, user=Depends(get_current_user)):
    try:
        res = (supabase.table("handoffs").select("*")
               .eq("patient_id", patient_id)
               .order("created_at", desc=True).execute())
        return _data(res, "handoff list") or []
    except Exception:
        logger.exception("Failed to list handoffs")
        return []

@router.post("/{handoff_id}/receive")
def mark_received(handoff_id: str, user=Depends(get_current_user)):
    current = _data(supabase.table("handoffs").select("structured_summary").eq("id", handoff_id).maybe_single().execute(), "handoff receive lookup") or {}
    summary = current.get("structured_summary") or {}
    summary["received"] = True
    summary["received_at"] = datetime.now(timezone.utc).isoformat()
    updated = (
        supabase.table("handoffs")
        .update({"incoming_doctor_id": user["id"], "structured_summary": summary})
        .eq("id", handoff_id)
        .execute()
    )
    data = _data(updated, "handoff receive update")
    return data[0] if data else {"id": handoff_id, "received": True}
