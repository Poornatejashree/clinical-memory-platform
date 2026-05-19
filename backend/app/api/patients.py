import logging
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from app.core.security import get_current_user
from app.core.supabase import supabase
from app.services.pattern_service import detect_cross_shift_patterns

router = APIRouter()
logger = logging.getLogger(__name__)

class PatientIn(BaseModel):
    name: str
    age: int | None = None
    bed: str
    diagnosis: str
    current_status: str | None = "stable"
    assigned_doctor: str | None = None
    department: str | None = None

def _safe_department(value: str | None) -> str:
    allowed = {"icu", "emergency", "cardiology", "neurology", "pediatrics", "surgery"}
    return value if value in allowed else "icu"

def _supabase_error(exc: Exception) -> dict:
    return {
        "type": type(exc).__name__,
        "message": str(exc),
        "code": getattr(exc, "code", None),
        "details": getattr(exc, "details", None),
        "hint": getattr(exc, "hint", None),
    }

def _response_data(response, label: str):
    if response is None:
        logger.error("Supabase %s returned None response", label)
        raise HTTPException(502, {"message": f"Supabase {label} returned no response."})
    return getattr(response, "data", None)

def _score_from_status(status: str | None) -> int:
    lower = (status or "").lower()
    if any(word in lower for word in ["critical", "unstable", "declining"]):
        return 45
    if any(word in lower for word in ["watch", "guarded", "moderate", "concern"]):
        return 65
    return 82

@router.get("/")
def list_patients(user=Depends(get_current_user)):
    try:
        prof_response = (
            supabase.table("profiles")
            .select("department")
            .eq("id", user["id"])
            .maybe_single()
            .execute()
        )
        prof = _response_data(prof_response, "profile lookup")
        if not prof:
            return []
        res = (supabase.table("patients").select("*")
               .eq("department", prof["department"])
               .order("admission_date", desc=True).execute())
        return _response_data(res, "patient list") or []
    except Exception:
        logger.exception("Failed to list patients")
        return []

@router.post("/")
def create_patient(body: PatientIn, user=Depends(get_current_user)):
    try:
        prof = None
        try:
            prof_response = (
                supabase.table("profiles")
                .select("department,full_name")
                .eq("id", user["id"])
                .maybe_single()
                .execute()
            )
            prof = _response_data(prof_response, "profile lookup")
        except Exception:
            logger.exception("Profile lookup failed during patient creation; using fallback profile")
        primary_doctor_id = user["id"]
        if not prof:
            fallback_profile = {
                "id": user["id"],
                "full_name": user.get("email") or "ShiftBrain Doctor",
                "role": "incoming_doctor",
                "department": _safe_department(body.department),
            }
            logger.warning("Profile missing for user %s; creating fallback profile", user["id"])
            try:
                profile_insert = supabase.table("profiles").upsert(fallback_profile).execute()
                inserted_profile = _response_data(profile_insert, "fallback profile upsert")
                prof = inserted_profile[0] if isinstance(inserted_profile, list) and inserted_profile else fallback_profile
            except Exception:
                logger.exception("Fallback profile upsert failed; creating patient without primary_doctor_id")
                prof = fallback_profile
                primary_doctor_id = None

        department = _safe_department(body.department or prof.get("department"))
        mrn = f"SB-{uuid4().hex[:8].upper()}"
        diagnosis = body.diagnosis
        if body.current_status:
            diagnosis = f"{diagnosis} | Status: {body.current_status}"
        if body.assigned_doctor:
            diagnosis = f"{diagnosis} | Assigned: {body.assigned_doctor}"

        row = {
            "mrn": mrn,
            "name": body.name,
            "age": body.age,
            "sex": "",
            "department": department,
            "bed": body.bed,
            "diagnosis": diagnosis,
            "stability_score": _score_from_status(body.current_status),
            "primary_doctor_id": primary_doctor_id,
        }
        logger.info("Creating patient with columns: %s", sorted(row.keys()))
        result = supabase.table("patients").insert(row).execute()
        inserted = _response_data(result, "patient insert")
        if not inserted:
            logger.error("Supabase patient insert returned no data. Response=%r", result)
            raise HTTPException(500, {"message": "Patient insert returned no row.", "inserted_columns": sorted(row.keys())})
        return inserted[0]
    except HTTPException:
        raise
    except Exception as exc:
        error = _supabase_error(exc)
        logger.exception("Failed to create patient. Supabase error=%s", error)
        raise HTTPException(
            500,
            {
                "message": "Patient could not be saved.",
                "supabase_error": error,
                "inserted_columns": [
                    "mrn",
                    "name",
                    "age",
                    "sex",
                    "department",
                    "bed",
                    "diagnosis",
                    "stability_score",
                    "primary_doctor_id",
                ],
            },
        )

@router.get("/{patient_id}")
def get_patient(patient_id: str, user=Depends(get_current_user)):
    try:
        patient_response = supabase.table("patients").select("*").eq("id", patient_id).maybe_single().execute()
        patient = _response_data(patient_response, "patient detail")
        if not patient:
            raise HTTPException(404, "Patient not found.")

        alerts_response = (supabase.table("alerts").select("*")
                  .eq("patient_id", patient_id).eq("acknowledged", False)
                  .order("created_at", desc=True).execute())
        alerts = _response_data(alerts_response, "patient alerts") or []
        return {**patient, "open_alerts": alerts}
    except HTTPException:
        raise
    except Exception as exc:
        error = _supabase_error(exc)
        logger.exception("Failed to load patient. Supabase error=%s", error)
        raise HTTPException(500, {"message": "Patient could not be loaded.", "supabase_error": error})

@router.get("/{patient_id}/patterns")
def get_patient_patterns(patient_id: str, user=Depends(get_current_user)):
    try:
        return detect_cross_shift_patterns(patient_id)
    except Exception as exc:
        logger.exception("Failed to detect cross-shift patterns for patient %s", patient_id)
        raise HTTPException(500, {"message": "Could not detect cross-shift patterns.", "error": str(exc)})
