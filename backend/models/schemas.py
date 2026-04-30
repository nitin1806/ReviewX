from pydantic import BaseModel
from typing import Dict, List, Optional


class WebSource(BaseModel):
    title: str
    url: str
    snippet: str


class SectionFeedback(BaseModel):
    name: str
    present: bool
    score: float  # 0-10
    feedback: str
    issues: List[str]
    suggestions: List[str]
    sources: List[WebSource]


class PlagiarismMatch(BaseModel):
    passage: str          # excerpt from the paper
    section: str
    matched_source: WebSource
    similarity_score: float  # 0.0 – 1.0


class PlagiarismResult(BaseModel):
    overall_similarity: float   # 0–100 percentage
    risk_level: str             # "Low" | "Medium" | "High"
    flagged_passages: List[PlagiarismMatch]
    checked_chunks: int


class GrammarResult(BaseModel):
    clarity_score: float          # 0–10
    passive_voice_instances: List[str]
    complex_sentences: List[str]
    undefined_acronyms: List[str]
    hedging_phrases: List[str]
    suggestions: List[str]


class CitationEntry(BaseModel):
    raw_text: str
    verified: bool
    search_result: Optional[WebSource] = None


class CitationValidationResult(BaseModel):
    total_parsed: int
    verified_count: int
    unverified_count: int
    citations: List[CitationEntry]


class ReviewResult(BaseModel):
    paper_title: str
    detected_domain: str
    overall_score: float
    review_summary: str
    sections: List[SectionFeedback]
    critical_issues: List[str]
    major_issues: List[str]
    minor_issues: List[str]
    missing_components: List[str]
    recommended_citations: List[WebSource]
    venue_suggestions: List[str]
    reviewer_perspective: str
    writing_quality_score: float
    novelty_score: float
    technical_rigor_score: float
    plagiarism: Optional[PlagiarismResult] = None
    grammar: Optional[GrammarResult] = None
    citations: Optional[CitationValidationResult] = None