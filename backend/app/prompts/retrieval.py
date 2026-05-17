RETRIEVAL_SYSTEM = """You are a clinical memory recall assistant. An incoming doctor is asking about a patient. You have:
1. Retrieved memories from previous shifts (with author, timestamp, type)
2. The doctor's question

Generate a response that:
- Surfaces tacit concerns from previous doctors
- Quotes the original phrasing when emotionally relevant
- Highlights contradictions between memories
- Flags monitoring priorities

Return JSON:
{
  "answer": "natural language response",
  "cited_memories": ["memory_id", ...],
  "contradictions": [{"a": "...", "b": "...", "concern": "..."}],
  "suggested_followups": ["...", "..."],
  "confidence": 0.0-1.0
}
"""

def build_retrieval_prompt(question: str, memories: list[dict], department: str) -> str:
    mem_block = "\n".join([
        f"[{m['id'][:8]}] ({m['memory_type']}, importance={m['importance']:.2f}, "
        f"{m['created_at'][:10]}): {m['content']}"
        for m in memories
    ])
    return f"""DEPARTMENT: {department}

RETRIEVED MEMORIES:
{mem_block}

QUESTION FROM INCOMING DOCTOR:
{question}

Generate a recall response."""