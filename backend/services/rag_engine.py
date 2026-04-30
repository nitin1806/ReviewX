"""
RAG engine: embeds paper chunks locally.
Uses fastembed (ONNX-based, no PyTorch needed) with TF-IDF fallback.
"""
from typing import List, Dict, Optional
import numpy as np

_embedding_fn = None


def _get_embedding_fn():
    """Lazy-load the best available embedding backend."""
    global _embedding_fn
    if _embedding_fn is not None:
        return _embedding_fn

    try:
        from fastembed import TextEmbedding
        model = TextEmbedding(model_name="BAAI/bge-small-en-v1.5")

        def fastembed_fn(texts: List[str]) -> List[List[float]]:
            return [emb.tolist() for emb in model.embed(texts)]

        _embedding_fn = fastembed_fn
        return _embedding_fn
    except Exception:
        pass

    # Fallback: TF-IDF cosine similarity (no ML library needed)
    from sklearn.feature_extraction.text import TfidfVectorizer
    _tfidf_vectorizer: Optional[TfidfVectorizer] = None
    _tfidf_matrix = None
    _tfidf_texts: List[str] = []

    def tfidf_fn(texts: List[str]) -> List[List[float]]:
        nonlocal _tfidf_vectorizer, _tfidf_matrix, _tfidf_texts
        if _tfidf_vectorizer is None or texts != _tfidf_texts:
            _tfidf_vectorizer = TfidfVectorizer(max_features=512, stop_words="english")
            mat = _tfidf_vectorizer.fit_transform(texts)
            _tfidf_matrix = mat.toarray().tolist()
            _tfidf_texts = texts
        return _tfidf_matrix

    _embedding_fn = tfidf_fn
    return _embedding_fn


def embed_texts(texts: List[str]) -> List[List[float]]:
    return _get_embedding_fn()(texts)


def cosine_similarity(a: List[float], b: List[float]) -> float:
    a_arr = np.array(a)
    b_arr = np.array(b)
    norm = np.linalg.norm(a_arr) * np.linalg.norm(b_arr)
    return float(np.dot(a_arr, b_arr) / (norm + 1e-10))


class PaperVectorStore:
    """In-memory vector store for paper chunks."""

    def __init__(self):
        self.chunks: List[Dict] = []
        self.embeddings: List[List[float]] = []

    def build(self, chunks: List[Dict]) -> None:
        if not chunks:
            return
        texts = [c["text"] for c in chunks]
        self.embeddings = embed_texts(texts)
        self.chunks = chunks

    def query(self, query: str, top_k: int = 3) -> List[Dict]:
        if not self.chunks:
            return []
        # For TF-IDF, need to re-fit with all texts + query
        try:
            fn = _get_embedding_fn()
            all_texts = [c["text"] for c in self.chunks] + [query]
            all_embs = fn(all_texts)
            query_emb = all_embs[-1]
            chunk_embs = all_embs[:-1]
        except Exception:
            return self.chunks[:top_k]

        scores = [cosine_similarity(query_emb, emb) for emb in chunk_embs]
        top_indices = sorted(range(len(scores)), key=lambda i: scores[i], reverse=True)[:top_k]
        results = []
        for idx in top_indices:
            chunk = self.chunks[idx].copy()
            chunk["similarity_score"] = scores[idx]
            results.append(chunk)
        return results

    def query_section(self, section_name: str) -> List[Dict]:
        return [c for c in self.chunks if c["section"] == section_name]
