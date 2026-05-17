"""
Hindsight memory layer — stores tacit clinical knowledge with vector recall.
"""
from app.core.supabase import supabase
from app.services.embedding_service import embed
from typing import Optional

class HindsightService:
    def store_memory(
        self,
        patient_id: str,
        author_id: str,
        department: str,
        memory_type: str,
        content: str,
        importance: float = 0.5,
        confidence: float = 0.5,
        tags: list[str] = None,
        handoff_id: Optional[str] = None,
        metadata: dict = None,
    ) -> dict:
        vec = embed(content)
        row = {
            "patient_id": patient_id,
            "author_id": author_id,
            "department": department,
            "memory_type": memory_type,
            "content": content,
            "embedding": vec,
            "importance": importance,
            "confidence": confidence,
            "tags": tags or [],
            "handoff_id": handoff_id,
            "metadata": metadata or {},
        }
        result = supabase.table("memories").insert(row).execute()
        return result.data[0]

    def retrieve(
        self,
        query: str,
        patient_id: Optional[str] = None,
        department: Optional[str] = None,
        top_k: int = 6,
    ) -> list[dict]:
        """Semantic retrieval via pgvector RPC."""
        qvec = embed(query)
        # Use a SQL RPC for vector similarity
        result = supabase.rpc("match_memories", {
            "query_embedding": qvec,
            "match_count": top_k,
            "filter_patient": patient_id,
            "filter_department": department,
        }).execute()
        return result.data or []

    def patient_timeline(self, patient_id: str, limit: int = 50) -> list[dict]:
        result = (supabase.table("memories")
            .select("*")
            .eq("patient_id", patient_id)
            .order("created_at", desc=True)
            .limit(limit)
            .execute())
        return result.data or []

hindsight = HindsightService()