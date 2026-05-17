"""Free local embeddings via sentence-transformers."""
from sentence_transformers import SentenceTransformer

_model = None

def _get_model():
    global _model
    if _model is None:
        print("Loading embedding model (first call only)...")
        _model = SentenceTransformer('all-MiniLM-L6-v2')
        print("Model loaded.")
    return _model

def embed(text: str) -> list[float]:
    vec = _get_model().encode(text, convert_to_numpy=True)
    return vec.tolist()

def embed_batch(texts: list[str]) -> list[list[float]]:
    vecs = _get_model().encode(texts, convert_to_numpy=True)
    return [v.tolist() for v in vecs]