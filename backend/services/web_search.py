"""
Web search service for retrieving relevant literature and standards.
Supports Tavily (preferred) with DuckDuckGo as fallback.
"""
import os
import asyncio
from typing import List, Optional
from models.schemas import WebSource


async def _search_tavily(query: str, max_results: int = 3) -> List[WebSource]:
    try:
        from tavily import TavilyClient
        api_key = os.getenv("TAVILY_API_KEY", "")
        if not api_key:
            return []
        client = TavilyClient(api_key=api_key)
        response = client.search(
            query=query,
            search_depth="basic",
            max_results=max_results,
            include_answer=False,
        )
        results = []
        for r in response.get("results", []):
            results.append(
                WebSource(
                    title=r.get("title", "Untitled"),
                    url=r.get("url", ""),
                    snippet=r.get("content", "")[:400],
                )
            )
        return results
    except Exception:
        return []


async def _search_duckduckgo(query: str, max_results: int = 3) -> List[WebSource]:
    try:
        from duckduckgo_search import DDGS
        results = []
        with DDGS() as ddgs:
            for r in ddgs.text(query, max_results=max_results):
                results.append(
                    WebSource(
                        title=r.get("title", "Untitled"),
                        url=r.get("href", ""),
                        snippet=r.get("body", "")[:400],
                    )
                )
        return results
    except Exception:
        return []


async def search_literature(query: str, max_results: int = 3) -> List[WebSource]:
    """Search for relevant literature. Tries Tavily first, falls back to DuckDuckGo."""
    results = await _search_tavily(query, max_results)
    if not results:
        results = await _search_duckduckgo(query, max_results)
    return results


async def gather_review_context(
    paper_title: str,
    domain: str,
    section_names: List[str],
) -> dict:
    """
    Run multiple parallel web searches to gather context for the review.
    Returns a dict mapping query_type -> list of WebSource.
    """
    search_queries = {
        "related_work": f"{paper_title} related work research 2022 2023 2024",
        "methodology_standards": f"best practices methodology section research paper {domain}",
        "evaluation_criteria": f"research paper evaluation criteria peer review {domain}",
        "writing_guidelines": f"academic research paper writing guidelines structure IEEE ACM",
        "novelty_check": f"{paper_title} prior work existing approaches",
    }

    # Only search for sections that are present
    section_lower = [s.lower() for s in section_names]
    if not any("result" in s or "experiment" in s or "evaluation" in s for s in section_lower):
        search_queries["results_guidelines"] = f"experimental results section research paper best practices"
    if not any("related" in s or "literature" in s for s in section_lower):
        search_queries["literature_review_tips"] = f"how to write literature review research paper {domain}"

    tasks = {key: search_literature(query) for key, query in search_queries.items()}
    results = {}
    for key, coro in tasks.items():
        results[key] = await coro

    return results
