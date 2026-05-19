import json
import time
import re
import logging

from fastapi import APIRouter, Depends, HTTPException
from groq import Groq
from pydantic import BaseModel

from app.config import settings
from app.core.security import get_current_user
from app.core.supabase import supabase
from app.services.pattern_service import detect_cross_shift_patterns

router = APIRouter()
logger = logging.getLogger(__name__)

class AskIn(BaseModel):
    patient_id: str
    question: str

GROQ_MODELS = tuple(
    model
    for model in dict.fromkeys(
        [
            settings.GROQ_MODEL,
            "llama-3.1-8b-instant",
            "llama-3.3-70b-versatile",
        ]
    )
    if model
)

def _summary(handoff: dict) -> dict:
    summary = handoff.get("structured_summary") or {}
    return {
        "id": handoff.get("id"),
        "doctor": summary.get("doctor_name") or "previous doctor",
        "formal": summary.get("formal_note") or "",
        "gut": summary.get("gut_concern") or "",
        "missing": summary.get("things_not_in_chart") or "",
        "watch": summary.get("watch_outs") or "",
        "shift": summary.get("shift") or handoff.get("shift_type") or "shift",
        "created_at": handoff.get("created_at"),
        "raw": handoff.get("raw_transcript") or "",
    }

def _memory_preview(memory: dict) -> dict:
    return {
        "id": memory.get("id"),
        "memory_type": memory.get("memory_type") or "memory",
        "created_at": memory.get("created_at"),
        "content": memory.get("content") or "",
        "importance": memory.get("importance"),
        "confidence": memory.get("confidence"),
    }

def _build_patient_prompt(patient: dict, handoffs: list[dict], memories: list[dict], patterns: list[dict], question: str) -> str:
    handoff_block = json.dumps([_summary(h) for h in handoffs], default=str, indent=2)
    memory_block = json.dumps([_memory_preview(m) for m in memories], default=str, indent=2)
    pattern_block = json.dumps(patterns, default=str, indent=2)
    patient_block = json.dumps(patient, default=str, indent=2)

    return f"""PATIENT:
{patient_block}

SAVED HANDOFF HISTORY FOR THIS PATIENT:
{handoff_block}

EXTRACTED MEMORIES FOR THIS PATIENT:
{memory_block}

CROSS-SHIFT PATTERNS DETECTED:
{pattern_block}

INCOMING DOCTOR QUESTION:
{question}

Answer using only the patient data, saved handoff notes, gut concerns, watch-outs, and memories above.
Make the answer specific to this patient and this exact question. If the evidence is thin, say what is missing.
If a cross-shift pattern is relevant to the question, mention it explicitly and cite the repeated evidence.
Return JSON with:
{{
  "answer": "direct natural-language answer for the incoming doctor",
  "cited_memories": ["handoff_or_memory_id"],
  "patterns": ["pattern names mentioned"],
  "cross_shift_pattern": false,
  "contradictions": [{{"a": "...", "b": "...", "concern": "..."}}],
  "suggested_followups": ["..."],
  "confidence": 0.0
}}"""

def _call_groq(system: str, prompt: str, user_id: str | None, patient_id: str) -> dict:
    client = Groq(api_key=settings.GROQ_API_KEY)
    last_exc: Exception | None = None

    for model in GROQ_MODELS:
        logger.info("memory.ask Groq call starting patient_id=%s model=%s", patient_id, model)
        t0 = time.time()
        try:
            resp = client.chat.completions.create(
                model=model,
                messages=[
                    {"role": "system", "content": system},
                    {"role": "user", "content": prompt},
                ],
                temperature=0.35,
                response_format={"type": "json_object"},
            )
            latency_ms = int((time.time() - t0) * 1000)
            content = resp.choices[0].message.content or "{}"
            parsed = json.loads(content)

            usage = getattr(resp, "usage", None)
            in_tokens = getattr(usage, "prompt_tokens", 0) if usage else 0
            out_tokens = getattr(usage, "completion_tokens", 0) if usage else 0
            logger.info(
                "memory.ask Groq call succeeded patient_id=%s model=%s latency_ms=%s",
                patient_id,
                model,
                latency_ms,
            )

            try:
                supabase.table("audit_logs").insert({
                    "user_id": user_id,
                    "patient_id": patient_id,
                    "action": "memory_ask",
                    "model_used": model,
                    "provider": "groq",
                    "input_tokens": in_tokens,
                    "output_tokens": out_tokens,
                    "latency_ms": latency_ms,
                    "cost_usd": 0,
                }).execute()
            except Exception:
                logger.exception("memory.ask audit log write failed patient_id=%s", patient_id)

            return {
                **parsed,
                "_meta": {
                    "provider": "groq",
                    "model": model,
                    "latency_ms": latency_ms,
                    "in_tokens": in_tokens,
                    "out_tokens": out_tokens,
                },
            }
        except Exception as exc:
            last_exc = exc
            logger.exception("memory.ask Groq call failed patient_id=%s model=%s", patient_id, model)

    raise RuntimeError(f"Groq failed for all configured models: {last_exc}")

@router.post("/ask")
def ask(body: AskIn, user=Depends(get_current_user)):
    logger.info("memory.ask patient_id received=%s", body.patient_id)
    logger.info("memory.ask question received=%s", body.question)
    try:
        patient_res = supabase.table("patients").select("*").eq("id", body.patient_id).maybe_single().execute()
        patient = getattr(patient_res, "data", None) or {"name": "this patient"}
        handoffs_res = (
            supabase.table("handoffs")
            .select("*")
            .eq("patient_id", body.patient_id)
            .order("created_at", desc=True)
            .execute()
        )
        handoffs = getattr(handoffs_res, "data", None) or []
        memories_res = (
            supabase.table("memories")
            .select("*")
            .eq("patient_id", body.patient_id)
            .order("created_at", desc=True)
            .execute()
        )
        memories = getattr(memories_res, "data", None) or []
        logger.info("memory.ask handoffs retrieved=%s patient_id=%s", len(handoffs), body.patient_id)
        patterns = detect_cross_shift_patterns(body.patient_id).get("patterns", [])
    except Exception as exc:
        logger.exception("Failed to answer from memory")
        raise HTTPException(500, {"message": "Could not read handoff history.", "error": str(exc)})

    if not handoffs:
        logger.info("memory.ask Groq not called patient_id=%s reason=no_handoff_history", body.patient_id)
        return {
            "response": {
                "answer": f"No handoff history found for {patient.get('name', 'this patient')} yet.",
                "cross_shift_pattern": False,
                "_meta": {"tier": "handoff-history", "cost": 0, "latency_ms": 0},
            },
            "memories": [],
        }

    logger.info(
        "memory.ask calling Groq patient_id=%s model_candidates=%s",
        body.patient_id,
        ", ".join(GROQ_MODELS),
    )
    system = (
        "You are ShiftBrain, a clinical handoff memory assistant for incoming doctors. "
        "You do not provide generic filler. You answer from the supplied patient-specific handoffs and memories. "
        "Be concise, natural, and conversational. Use short paragraphs or brief bullets. "
        "Name the concrete handoff signal first, then the recommended first check. "
        "Be clinically cautious and explicit about gut concerns, watch-outs, and missing context."
    )
    prompt = _build_patient_prompt(patient, handoffs, memories, patterns, body.question)
    try:
        response = _call_groq(system, prompt, user.get("id"), body.patient_id)
    except Exception as exc:
        logger.exception("memory.ask failed to get Groq answer patient_id=%s", body.patient_id)
        raise HTTPException(
            status_code=502,
            detail={
                "message": "The AI service could not answer right now. Groq failed, and no fallback answer was used.",
                "error": str(exc),
            },
        )

    cited = set(response.get("cited_memories") or [])
    cited_handoffs = [
        {
            "id": handoff["id"],
            "memory_type": "handoff",
            "created_at": handoff.get("created_at"),
            "content": re.sub(r"\s+", " ", handoff.get("raw_transcript") or "")[:500],
        }
        for handoff in handoffs
        if not cited or handoff["id"] in cited
    ]
    cited_memories = [
        {
            "id": memory["id"],
            "memory_type": memory.get("memory_type") or "memory",
            "created_at": memory.get("created_at"),
            "content": re.sub(r"\s+", " ", memory.get("content") or "")[:500],
        }
        for memory in memories
        if memory.get("id") in cited
    ]
    evidence = (cited_handoffs + cited_memories)[:4]
    if not evidence:
        evidence = [
            {
                "id": handoff["id"],
                "memory_type": "handoff",
                "created_at": handoff.get("created_at"),
                "content": re.sub(r"\s+", " ", handoff.get("raw_transcript") or "")[:500],
            }
            for handoff in handoffs[:4]
        ]

    return {
        "response": {
            **response,
            "cross_shift_pattern": response.get("cross_shift_pattern", bool(patterns)),
            "patterns": response.get("patterns") or [pattern["pattern"] for pattern in patterns],
            "detected_patterns": patterns,
        },
        "memories": evidence,
    }

@router.get("/timeline/{patient_id}")
def timeline(patient_id: str, user=Depends(get_current_user)):
    try:
        res = (
            supabase.table("timeline_events")
            .select("*")
            .eq("patient_id", patient_id)
            .order("created_at", desc=True)
            .limit(50)
            .execute()
        )
        return getattr(res, "data", None) or []
    except Exception:
        logger.exception("Failed to load memory timeline")
        return []
