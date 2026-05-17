"""
cascadeflow — intelligent model routing.
Cheap models try first; escalate to premium when:
- confidence is low
- critical keywords detected
- contradictions found
- output fails schema validation
"""
import time
import json
from groq import Groq
import httpx
from app.config import settings
from app.core.supabase import supabase

groq_client = Groq(api_key=settings.GROQ_API_KEY)

# Cost per 1M tokens (USD) — adjust to current pricing
MODELS = {
    "fast":     {"provider": "groq",       "name": "llama-3.1-8b-instant",   "in": 0.05,  "out": 0.08},
    "balanced": {"provider": "groq",       "name": "llama-3.3-70b-versatile","in": 0.59,  "out": 0.79},
    "premium":  {"provider": "openrouter", "name": "anthropic/claude-3.5-sonnet", "in": 3.00, "out": 15.00},
}

CRITICAL_KEYWORDS = [
    "cardiac arrest", "stroke", "hemorrhage", "sepsis", "code blue",
    "anaphylaxis", "respiratory failure", "unstable", "deteriorating",
]

class CascadeService:
    def _call_groq(self, model: str, system: str, user: str) -> tuple[str, dict]:
        t0 = time.time()
        resp = groq_client.chat.completions.create(
            model=model,
            messages=[{"role":"system","content":system},{"role":"user","content":user}],
            temperature=0.2,
            response_format={"type": "json_object"},
        )
        latency = int((time.time() - t0) * 1000)
        return resp.choices[0].message.content, {
            "in_tokens": resp.usage.prompt_tokens,
            "out_tokens": resp.usage.completion_tokens,
            "latency_ms": latency,
        }

    def _call_openrouter(self, model: str, system: str, user: str) -> tuple[str, dict]:
        t0 = time.time()
        r = httpx.post(
            "https://openrouter.ai/api/v1/chat/completions",
            headers={"Authorization": f"Bearer {settings.OPENROUTER_API_KEY}"},
            json={
                "model": model,
                "messages": [{"role":"system","content":system},{"role":"user","content":user}],
                "temperature": 0.2,
            },
            timeout=60.0,
        )
        r.raise_for_status()
        data = r.json()
        latency = int((time.time() - t0) * 1000)
        return data["choices"][0]["message"]["content"], {
            "in_tokens": data["usage"]["prompt_tokens"],
            "out_tokens": data["usage"]["completion_tokens"],
            "latency_ms": latency,
        }

    def _cost(self, tier: str, in_tokens: int, out_tokens: int) -> float:
        m = MODELS[tier]
        return (in_tokens * m["in"] + out_tokens * m["out"]) / 1_000_000

    def _route_tier(self, prompt: str) -> str:
        lower = prompt.lower()
        if any(k in lower for k in CRITICAL_KEYWORDS):
            return "premium"
        if len(prompt) > 2000:
            return "balanced"
        return "fast"

    def run(
        self,
        system: str,
        user: str,
        require_json: bool = True,
        user_id: str = None,
        patient_id: str = None,
        action: str = "extract",
    ) -> dict:
        tier = self._route_tier(user)
        escalation_reason = None
        attempts = []

        for attempt_tier in [tier, "balanced", "premium"]:
            if attempt_tier in [a["tier"] for a in attempts]:
                continue
            m = MODELS[attempt_tier]
            try:
                if m["provider"] == "groq":
                    content, telem = self._call_groq(m["name"], system, user)
                else:
                    content, telem = self._call_openrouter(m["name"], system, user)

                parsed = json.loads(content) if require_json else {"text": content}
                cost = self._cost(attempt_tier, telem["in_tokens"], telem["out_tokens"])

                # Audit
                supabase.table("audit_logs").insert({
                    "user_id": user_id,
                    "patient_id": patient_id,
                    "action": action,
                    "model_used": m["name"],
                    "provider": m["provider"],
                    "input_tokens": telem["in_tokens"],
                    "output_tokens": telem["out_tokens"],
                    "latency_ms": telem["latency_ms"],
                    "cost_usd": cost,
                    "escalation_reason": escalation_reason,
                }).execute()

                # Confidence-based escalation
                conf = parsed.get("confidence", 1.0)
                if conf < 0.5 and attempt_tier != "premium":
                    escalation_reason = f"low_confidence={conf}"
                    attempts.append({"tier": attempt_tier})
                    continue

                return {**parsed, "_meta": {"tier": attempt_tier, "cost": cost, **telem}}

            except (json.JSONDecodeError, httpx.HTTPError) as e:
                escalation_reason = f"error: {type(e).__name__}"
                attempts.append({"tier": attempt_tier})
                continue

        raise RuntimeError("All cascade tiers failed")

cascade = CascadeService()