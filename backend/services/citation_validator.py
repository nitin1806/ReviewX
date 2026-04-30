"""
Citation Validator: parses the References section, searches the web
for each citation title, and marks entries as verified or unverified.
Uses the existing search_literature infrastructure; capped at 10 citations.
"""
import re
import asyncio
from typing import List, Optional

from models.schemas import CitationEntry, CitationValidationResult, WebSource
from services.web_search import search_literature

MAX_CITATIONS = 10

# Patterns for common reference formats:
#   [1] Author...       (IEEE / numbered bracket)
#   1. Author...        (numbered list)
#   Author et al. (YYYY) (author-year inline)
_SPLIT_PATTERNS = [
    re.compile(r"\[\d+\]\s+"),           # [1] ...
    re.compile(r"(?m)^\d+\.\s+"),        # 1. ...
    re.compile(r"\n(?=[A-Z][a-z]+,\s)"), # newline before "Lastname, ..."
]


def _parse_citations(references_text: str) -> List[str]:
    """
    Split the References section into individual citation strings.
    Tries each pattern in order; uses the one that produces the most splits.
    Falls back to splitting on double-newlines.
    """
    best: List[str] = []

    for pattern in _SPLIT_PATTERNS:
        parts = [p.strip() for p in pattern.split(references_text) if p.strip()]
        if len(parts) > len(best):
            best = parts

    if len(best) <= 1:
        # Last-resort: split on blank lines
        best = [p.strip() for p in re.split(r"\n\s*\n", references_text) if p.strip()]

    # Remove very short fragments (page numbers, section labels, etc.)
    return [p for p in best if len(p) > 20][:MAX_CITATIONS]


def _extract_search_query(citation: str) -> str:
    """
    Pull the most searchable part of a citation string — typically the title,
    which appears after the authors and before the venue/year in most formats.
    Heuristic: the longest quoted or title-cased phrase, or first 100 chars.
    """
    # Try to find a quoted title
    quoted = re.findall(r'"([^"]{10,120})"', citation)
    if quoted:
        return quoted[0]

    # Try to find a title between authors (ends with period) and venue info
    # Pattern: after first ". " and before second ". " or "In " or year
    title_match = re.search(
        r"\.\s+([A-Z][^.]{15,120}?)(?:\.\s|\s+In\s|\s+Proc|\s+\d{4})",
        citation,
    )
    if title_match:
        return title_match.group(1).strip()

    # Fall back to the whole citation truncated
    return citation[:120].strip()


async def validate_citations(sections: dict) -> CitationValidationResult:
    """
    Main entry point. Looks for a References section, parses it,
    and verifies each citation via web search.
    """
    # Find the references section (case-insensitive key match)
    ref_text = ""
    for key, text in sections.items():
        if "reference" in key.lower() or "bibliography" in key.lower():
            ref_text = text
            break

    if not ref_text.strip():
        return CitationValidationResult(
            total_parsed=0,
            verified_count=0,
            unverified_count=0,
            citations=[],
        )

    raw_citations = _parse_citations(ref_text)
    if not raw_citations:
        return CitationValidationResult(
            total_parsed=0,
            verified_count=0,
            unverified_count=0,
            citations=[],
        )

    async def _verify(raw: str) -> CitationEntry:
        query = _extract_search_query(raw)
        try:
            results = await search_literature(query, max_results=2)
        except Exception:
            results = []

        verified = len(results) > 0
        best: Optional[WebSource] = results[0] if results else None
        return CitationEntry(raw_text=raw, verified=verified, search_result=best)

    entries = await asyncio.gather(*[_verify(c) for c in raw_citations])
    entries = list(entries)

    verified_count = sum(1 for e in entries if e.verified)

    return CitationValidationResult(
        total_parsed=len(entries),
        verified_count=verified_count,
        unverified_count=len(entries) - verified_count,
        citations=entries,
    )
