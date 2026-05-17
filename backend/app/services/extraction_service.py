from app.services.cascade_service import cascade
from app.services.hindsight_service import hindsight
from app.prompts.extraction import EXTRACTION_SYSTEM, build_extraction_prompt
from app.core.supabase import supabase

class ExtractionService:
    def extract_handoff(
        self,
        transcript: str,
        department: str,
        patient_id: str,
        author_id: str,
        handoff_id: str,
    ) -> dict:
        # Get prior patient context (last 3 memories as context)
        prior = hindsight.patient_timeline(patient_id, limit=3)
        ctx = "\n".join([m["content"] for m in prior]) if prior else ""

        prompt = build_extraction_prompt(transcript, department, ctx)
        result = cascade.run(
            system=EXTRACTION_SYSTEM,
            user=prompt,
            user_id=author_id,
            patient_id=patient_id,
            action="extract",
        )

        # Persist structured fields back to handoff
        supabase.table("handoffs").update({
            "structured_summary": result.get("structured_summary"),
            "risks": result.get("risks"),
            "hidden_concerns": result.get("hidden_concerns"),
            "unresolved_issues": result.get("unresolved_issues"),
            "monitoring_priorities": result.get("monitoring_priorities"),
            "confidence_score": result.get("doctor_confidence"),
            "escalation_risk": result.get("escalation_risk"),
        }).eq("id", handoff_id).execute()

        # Store each tacit memory in Hindsight
        for mem in result.get("tacit_memories", []):
            hindsight.store_memory(
                patient_id=patient_id,
                author_id=author_id,
                department=department,
                memory_type=mem["type"],
                content=mem["content"],
                importance=mem.get("importance", 0.5),
                confidence=result.get("doctor_confidence", 0.5),
                handoff_id=handoff_id,
            )

        # Auto-create alerts for critical risks
        for risk in result.get("risks", []):
            if risk["severity"] in ("high", "critical"):
                supabase.table("alerts").insert({
                    "patient_id": patient_id,
                    "alert_type": "critical" if risk["severity"] == "critical" else "escalation",
                    "severity": risk["severity"],
                    "title": risk["risk"][:80],
                    "message": risk["risk"],
                }).execute()

        return result

extractor = ExtractionService()