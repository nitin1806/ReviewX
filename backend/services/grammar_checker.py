"""
Grammar & Clarity Scorer: uses a single LLM call to audit the
Abstract and Introduction for common academic writing issues.
No web search or extra dependencies required.
"""
import json
from typing import Any

from models.schemas import GrammarResult


def _flatten_strings(value: list) -> list:
    """
    Ensure every element of a list is a plain string.
    The LLM occasionally returns a nested list instead of a string element;
    this flattens one level deep and converts everything to str.
    """
    result = []
    for item in value:
        if isinstance(item, list):
            result.extend(str(s) for s in item if s)
        elif item:
            result.append(str(item))
    return result


def _build_prompt(abstract: str, introduction: str) -> str:
    intro_excerpt = introduction.strip()[:2000]
    return f"""You are an expert academic writing editor reviewing a research paper.

Analyse the **Abstract** and **Introduction** below for writing quality issues commonly flagged by peer reviewers.

=== ABSTRACT ===
{abstract[:1500]}

=== INTRODUCTION (first 2000 chars) ===
{intro_excerpt}

Return ONLY a JSON object in exactly this format — no extra text:
{{
  "clarity_score": <float 0-10, where 10 is perfect academic clarity>,
  "passive_voice_instances": [
    "<quoted sentence or clause using passive voice>",
    ... up to 5 examples
  ],
  "complex_sentences": [
    "<quoted sentence that is excessively long or convoluted>",
    ... up to 5 examples
  ],
  "undefined_acronyms": [
    "<ACRONYM> — appears before its definition",
    ... all found
  ],
  "hedging_phrases": [
    "<quoted phrase showing unnecessary hedging, e.g. 'it seems', 'might possibly'>",
    ... up to 5 examples
  ],
  "suggestions": [
    "<specific, actionable rewrite suggestion>",
    ... up to 6 suggestions
  ]
}}

Scoring guide: 8-10 = publication-ready, 6-8 = minor fixes needed, 4-6 = significant rewrites needed, <4 = major clarity problems.
Be specific — quote actual text from the paper where possible."""


def check_grammar(paper: dict, chat_complete_fn: Any) -> GrammarResult:
    """
    Run the grammar/clarity check synchronously.
    `chat_complete_fn` is the same `_chat_complete` used by review_generator.
    """
    abstract = paper.get("abstract", "").strip()
    introduction = paper.get("sections", {}).get("Introduction", "").strip()

    if not abstract and not introduction:
        return GrammarResult(
            clarity_score=5.0,
            passive_voice_instances=[],
            complex_sentences=[],
            undefined_acronyms=[],
            hedging_phrases=[],
            suggestions=["Could not find Abstract or Introduction text to analyse."],
        )

    prompt = _build_prompt(abstract, introduction)

    try:
        raw = chat_complete_fn([{"role": "user", "content": prompt}], json_mode=True)
        data = json.loads(raw)
    except Exception as e:
        return GrammarResult(
            clarity_score=5.0,
            passive_voice_instances=[],
            complex_sentences=[],
            undefined_acronyms=[],
            hedging_phrases=[],
            suggestions=[f"Grammar check failed: {str(e)}"],
        )

    return GrammarResult(
        clarity_score=float(data.get("clarity_score", 5.0)),
        passive_voice_instances=_flatten_strings(data.get("passive_voice_instances", [])),
        complex_sentences=_flatten_strings(data.get("complex_sentences", [])),
        undefined_acronyms=_flatten_strings(data.get("undefined_acronyms", [])),
        hedging_phrases=_flatten_strings(data.get("hedging_phrases", [])),
        suggestions=_flatten_strings(data.get("suggestions", [])),
    )
