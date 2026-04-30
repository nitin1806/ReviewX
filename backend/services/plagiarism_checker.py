"""
Plagiarism checker: searches the web for matching content and scores
text similarity between paper passages and retrieved snippets.
Uses difflib.SequenceMatcher (stdlib, no extra deps).
"""
import difflib
import asyncio
from typing import List, Dict

from models.schemas import PlagiarismMatch, PlagiarismResult, WebSource
from services.web_search import search_literature

# Passage is flagged if similarity with any web snippet exceeds this
SIMILARITY_THRESHOLD = 0.35

# Risk level thresholds (overall_similarity is 0–100)
RISK_HIGH = 40.0
RISK_MEDIUM = 20.0

# Cap the number of chunks sent to web search to avoid burning quota
MAX_CHUNKS_TO_CHECK = 8


def _similarity(a: str, b: str) -> float:
    """Normalised edit-distance similarity between two strings (0–1)."""
    return difflib.SequenceMatcher(None, a.lower(), b.lower()).ratio()


def _pick_representative_chunks(
    sections: Dict[str, str],
    max_total: int = MAX_CHUNKS_TO_CHECK,
) -> List[Dict[str, str]]:
    """
    Select up to `max_total` representative passages across sections.
    Takes the first 300 characters of the first chunk of each section.
    """
    candidates = []
    for section_name, text in sections.items():
        if section_name in ("Preamble", "Full Paper") or len(text.strip()) < 80:
            continue
        excerpt = text.strip()[:300].strip()
        if excerpt:
            candidates.append({"section": section_name, "text": excerpt})

    # Distribute slots evenly; prioritise sections with more text
    candidates.sort(key=lambda c: -len(c["text"]))
    return candidates[:max_total]


async def check_plagiarism(sections: Dict[str, str]) -> PlagiarismResult:
    """
    Main entry point.
    1. Pick representative passages from each section.
    2. Search the web for each passage (first sentence / key phrase).
    3. Score similarity between the passage and every retrieved snippet.
    4. Aggregate into PlagiarismResult.
    """
    chunks = _pick_representative_chunks(sections)
    if not chunks:
        return PlagiarismResult(
            overall_similarity=0.0,
            risk_level="Low",
            flagged_passages=[],
            checked_chunks=0,
        )

    flagged: List[PlagiarismMatch] = []
    max_similarities: List[float] = []

    async def _check_chunk(chunk: Dict[str, str]):
        # Use the first sentence (up to 120 chars) as the search query
        query_text = chunk["text"][:120].rsplit(" ", 1)[0]
        sources: List[WebSource] = await search_literature(query_text, max_results=3)

        best_sim = 0.0
        for source in sources:
            sim = _similarity(chunk["text"], source.snippet)
            if sim > best_sim:
                best_sim = sim
            if sim >= SIMILARITY_THRESHOLD:
                flagged.append(
                    PlagiarismMatch(
                        passage=chunk["text"],
                        section=chunk["section"],
                        matched_source=source,
                        similarity_score=round(sim, 3),
                    )
                )
        max_similarities.append(best_sim)

    # Run all chunk checks concurrently
    await asyncio.gather(*[_check_chunk(c) for c in chunks])

    # Deduplicate flagged passages (same passage + same URL)
    seen = set()
    unique_flagged = []
    for match in flagged:
        key = (match.passage[:80], match.matched_source.url)
        if key not in seen:
            seen.add(key)
            unique_flagged.append(match)

    # Sort by descending similarity so the worst offenders appear first
    unique_flagged.sort(key=lambda m: -m.similarity_score)

    overall_similarity = round(
        (sum(max_similarities) / len(max_similarities)) * 100, 1
    ) if max_similarities else 0.0

    if overall_similarity >= RISK_HIGH:
        risk_level = "High"
    elif overall_similarity >= RISK_MEDIUM:
        risk_level = "Medium"
    else:
        risk_level = "Low"

    return PlagiarismResult(
        overall_similarity=overall_similarity,
        risk_level=risk_level,
        flagged_passages=unique_flagged,
        checked_chunks=len(chunks),
    )
