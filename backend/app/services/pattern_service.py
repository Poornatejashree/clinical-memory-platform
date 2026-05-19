import re
from collections import defaultdict
from datetime import datetime
from typing import Any

from app.core.supabase import supabase


PATTERN_RULES = [
    {
        "key": "gut",
        "pattern": "Repeated gut concern",
        "terms": ["gut concern", "something feels off", "feels off", "not right", "worried", "concern"],
        "risk_level": "medium",
        "suggested_action": "Incoming doctor should manually reassess patient early in shift.",
    },
    {
        "key": "quiet_anxious",
        "pattern": "Repeated behavior change",
        "terms": ["quiet", "unusually quiet", "anxious", "anxiety", "withdrawn", "not herself", "not himself"],
        "risk_level": "medium",
        "suggested_action": "Incoming doctor should compare current behavior with baseline and family report.",
    },
    {
        "key": "bp",
        "pattern": "Repeated BP concern",
        "terms": ["bp spike", "blood pressure spike", "blood pressure", "hypertensive", "hypotensive"],
        "risk_level": "medium",
        "suggested_action": "Incoming doctor should recheck BP early and review overnight trends.",
    },
    {
        "key": "pain",
        "pattern": "Repeated pain change",
        "terms": ["pain changed", "different pain", "pain is different", "new pain", "worsening pain"],
        "risk_level": "medium",
        "suggested_action": "Incoming doctor should reassess pain quality and examine for interval change.",
    },
    {
        "key": "family",
        "pattern": "Repeated family concern",
        "terms": ["family concern", "family worried", "daughter", "son", "spouse", "family says"],
        "risk_level": "low",
        "suggested_action": "Incoming doctor should clarify family concerns and compare them with bedside findings.",
    },
    {
        "key": "missing_chart",
        "pattern": "Repeated missing-chart context",
        "terms": ["not in chart", "missing chart", "not documented", "not charted", "not in the notes"],
        "risk_level": "medium",
        "suggested_action": "Incoming doctor should verify the undocumented context before relying on chart review alone.",
    },
]


def _data(response: Any) -> Any:
    return getattr(response, "data", None) or []


def _summary(handoff: dict) -> dict:
    return handoff.get("structured_summary") or {}


def _created_at(value: str | None) -> datetime:
    if not value:
        return datetime.min
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return datetime.min


def _doctor_label(handoff: dict) -> str:
    summary = _summary(handoff)
    return summary.get("doctor_name") or "A previous doctor"


def _clean(value: str | None) -> str:
    return re.sub(r"\s+", " ", value or "").strip()


def _handoff_text(handoff: dict) -> str:
    summary = _summary(handoff)
    parts = [
        summary.get("formal_note"),
        summary.get("gut_concern"),
        summary.get("things_not_in_chart"),
        summary.get("watch_outs"),
        handoff.get("raw_transcript"),
        " ".join(str(item.get("concern", "")) for item in handoff.get("hidden_concerns") or [] if isinstance(item, dict)),
        " ".join(str(item) for item in handoff.get("monitoring_priorities") or []),
    ]
    return " ".join(_clean(str(part)) for part in parts if part).lower()


def _handoff_evidence(handoff: dict, rule: dict) -> str:
    summary = _summary(handoff)
    candidate = (
        summary.get("gut_concern")
        or summary.get("watch_outs")
        or summary.get("things_not_in_chart")
        or summary.get("formal_note")
        or handoff.get("raw_transcript")
        or "flagged a related concern"
    )
    return f"{_doctor_label(handoff)} noted {_clean(str(candidate))[:180]}"


def _memory_text(memory: dict) -> str:
    tags = memory.get("tags") or []
    return " ".join([
        _clean(memory.get("memory_type")),
        _clean(memory.get("content")),
        " ".join(str(tag) for tag in tags),
    ]).lower()


def _memory_evidence(memory: dict) -> str:
    return _clean(memory.get("content"))[:180] or f"{memory.get('memory_type') or 'Memory'} matched this pattern"


def detect_cross_shift_patterns(patient_id: str) -> dict:
    patient_res = supabase.table("patients").select("*").eq("id", patient_id).maybe_single().execute()
    patient = getattr(patient_res, "data", None) or {}

    handoffs = _data(
        supabase.table("handoffs")
        .select("*")
        .eq("patient_id", patient_id)
        .order("created_at", desc=False)
        .execute()
    )
    memories = _data(
        supabase.table("memories")
        .select("*")
        .eq("patient_id", patient_id)
        .order("created_at", desc=False)
        .execute()
    )

    buckets: dict[str, list[dict]] = defaultdict(list)

    for handoff in handoffs:
        text = _handoff_text(handoff)
        for rule in PATTERN_RULES:
            if any(term in text for term in rule["terms"]):
                buckets[rule["key"]].append({
                    "source": "handoff",
                    "id": handoff.get("id"),
                    "created_at": handoff.get("created_at"),
                    "evidence": _handoff_evidence(handoff, rule),
                })

    for memory in memories:
        text = _memory_text(memory)
        for rule in PATTERN_RULES:
            if any(term in text for term in rule["terms"]) or memory.get("memory_type") == rule["key"]:
                buckets[rule["key"]].append({
                    "source": "memory",
                    "id": memory.get("id"),
                    "created_at": memory.get("created_at"),
                    "evidence": _memory_evidence(memory),
                })

    patterns = []
    for rule in PATTERN_RULES:
        seen: set[str] = set()
        evidence_rows = []
        for item in sorted(buckets[rule["key"]], key=lambda row: _created_at(row.get("created_at"))):
            key = item.get("id") or item["evidence"]
            if key in seen:
                continue
            seen.add(key)
            evidence_rows.append(item)

        if len(evidence_rows) < 2:
            continue

        handoff_dates = {
            (_created_at(row.get("created_at")).date().isoformat(), row.get("source"))
            for row in evidence_rows
            if row.get("created_at")
        }
        consecutive_hint = len({date for date, source in handoff_dates if source == "handoff"}) >= 2
        patterns.append({
            "pattern": rule["pattern"],
            "evidence_count": len(evidence_rows),
            "evidence": [row["evidence"] for row in evidence_rows[:4]],
            "risk_level": rule["risk_level"],
            "suggested_action": rule["suggested_action"],
            "consecutive_shift_hint": consecutive_hint,
        })

    return {
        "patient": patient,
        "patterns": patterns,
    }
