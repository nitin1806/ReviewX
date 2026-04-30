"""
Review generation service: orchestrates RAG + web search to produce structured feedback.
Supports Groq (primary, free) and OpenAI (fallback) as LLM backends.
"""
import os
import json
import asyncio
from typing import Dict, List, AsyncGenerator, Any

from models.schemas import ReviewResult, SectionFeedback, WebSource
from services.pdf_parser import parse_paper, get_paper_chunks
from services.rag_engine import PaperVectorStore
from services.web_search import gather_review_context
from services.plagiarism_checker import check_plagiarism
from services.grammar_checker import check_grammar
from services.citation_validator import validate_citations

# LLM provider selection
# Priority: GROQ_API_KEY → OPENAI_API_KEY
LLM_MODEL = os.getenv("LLM_MODEL", "")

_client: Any = None
_provider: str = ""


def _get_client():
    global _client, _provider, LLM_MODEL
    if _client is not None:
        return _client

    groq_key = os.getenv("GROQ_API_KEY", "")
    openai_key = os.getenv("OPENAI_API_KEY", "")

    if groq_key:
        from groq import Groq
        _client = Groq(api_key=groq_key)
        _provider = "groq"
        if not LLM_MODEL:
            LLM_MODEL = "llama-3.3-70b-versatile"
    elif openai_key:
        from openai import OpenAI
        _client = OpenAI(api_key=openai_key)
        _provider = "openai"
        if not LLM_MODEL:
            LLM_MODEL = "gpt-4o-mini"
    else:
        raise RuntimeError("No LLM API key configured. Set GROQ_API_KEY or OPENAI_API_KEY in .env")

    return _client


def _chat_complete(messages: list, json_mode: bool = True) -> str:
    """Unified chat completion that works for both Groq and OpenAI."""
    client = _get_client()
    kwargs: dict = {
        "model": LLM_MODEL,
        "messages": messages,
        "temperature": 0.3,
    }
    if json_mode:
        kwargs["response_format"] = {"type": "json_object"}

    resp = client.chat.completions.create(**kwargs)
    return resp.choices[0].message.content

EXPECTED_SECTIONS = ["Abstract", "Introduction", "Related Work", "Methodology", "Results", "Discussion", "Conclusion", "References"]

SECTION_CRITERIA = {
    "Abstract": "clarity, completeness (problem, method, results, contribution), conciseness (150-250 words)",
    "Introduction": "problem motivation, research gap, contributions listed, paper structure outlined",
    "Related Work": "coverage of prior art, comparison with proposed approach, recency of citations",
    "Methodology": "clarity, reproducibility, novelty, algorithmic detail, justification of design choices",
    "Results": "statistical rigor, baselines compared, ablation studies, visualization quality, interpretation",
    "Discussion": "limitations acknowledged, implications discussed, future work suggested",
    "Conclusion": "summarizes contributions, no new claims, actionable takeaways",
    "References": "consistent formatting, sufficient quantity (15+), recent works included, self-citation balance",
}


def _format_sources(sources: List[WebSource]) -> str:
    if not sources:
        return "No external sources retrieved."
    return "\n".join(
        f"- [{s.title}]({s.url}): {s.snippet[:200]}" for s in sources
    )


def _detect_domain(paper: Dict) -> str:
    """Simple keyword-based domain detection."""
    text_lower = (paper["title"] + " " + paper["abstract"] + " " + paper["keywords"]).lower()
    domain_keywords = {
        "Machine Learning / Deep Learning": ["neural network", "deep learning", "machine learning", "transformer", "bert", "gpt", "llm", "cnn", "rnn", "lstm"],
        "Computer Vision": ["image", "object detection", "segmentation", "visual", "pixel", "convolutional"],
        "Natural Language Processing": ["nlp", "text", "language model", "sentiment", "summarization", "translation", "named entity"],
        "Cybersecurity": ["attack", "vulnerability", "malware", "intrusion", "cryptography", "security"],
        "Databases / Data Management": ["database", "sql", "query", "indexing", "data warehouse"],
        "Networking / Systems": ["network", "protocol", "latency", "throughput", "distributed"],
        "Bioinformatics": ["genomic", "dna", "protein", "biological", "biomedical"],
        "Robotics": ["robot", "autonomous", "control", "sensor", "actuator"],
    }
    best_domain = "Computer Science / Engineering"
    best_count = 0
    for domain, keywords in domain_keywords.items():
        count = sum(1 for kw in keywords if kw in text_lower)
        if count > best_count:
            best_count = count
            best_domain = domain
    return best_domain


def _review_section_prompt(
    section_name: str,
    section_text: str,
    rag_context: str,
    web_context: str,
    domain: str,
) -> str:
    criteria = SECTION_CRITERIA.get(section_name, "clarity, completeness, technical rigor")
    return f"""You are an expert peer reviewer for top-tier academic conferences (NeurIPS, ICML, CVPR, ACL, etc.).

Review the following **{section_name}** section of a research paper in the domain of **{domain}**.

=== PAPER SECTION TEXT ===
{section_text[:3000]}

=== RELEVANT CONTEXT FROM THE PAPER (RAG retrieval) ===
{rag_context}

=== RELEVANT WEB LITERATURE / STANDARDS ===
{web_context}

=== REVIEW CRITERIA FOR {section_name.upper()} ===
{criteria}

Provide a detailed review in the following JSON format:
{{
  "score": <float 0-10>,
  "feedback": "<2-3 paragraph detailed feedback>",
  "issues": ["<specific issue 1>", "<specific issue 2>", ...],
  "suggestions": ["<actionable suggestion 1>", "<actionable suggestion 2>", ...]
}}

Be constructive, specific, and reference the actual paper content. Score strictly (7+ = good, 5-7 = needs work, <5 = major issues)."""


def _overall_review_prompt(
    paper: Dict,
    section_reviews: Dict[str, dict],
    web_context: Dict,
    domain: str,
) -> str:
    sections_summary = "\n".join(
        f"- {name}: score {rev.get('score', 0):.1f}/10" for name, rev in section_reviews.items()
    )
    present_sections = list(section_reviews.keys())
    missing = [s for s in EXPECTED_SECTIONS if not any(s.lower() in p.lower() for p in present_sections)]

    all_web = []
    for sources in web_context.values():
        all_web.extend(sources[:2])
    web_summary = _format_sources(all_web[:6])

    return f"""You are a senior area chair at a top AI/CS conference reviewing a paper titled:
"{paper['title']}"
Domain: {domain}

Abstract: {paper['abstract'][:600]}

Section scores:
{sections_summary}

Missing sections: {missing if missing else 'None'}

Relevant literature retrieved from the web:
{web_summary}

Provide a comprehensive overall review in JSON format:
{{
  "review_summary": "<executive summary, 3-4 sentences>",
  "overall_score": <float 0-10>,
  "writing_quality_score": <float 0-10>,
  "novelty_score": <float 0-10>,
  "technical_rigor_score": <float 0-10>,
  "critical_issues": ["<blocking issue 1>", ...],
  "major_issues": ["<significant issue 1>", ...],
  "minor_issues": ["<minor issue 1>", ...],
  "missing_components": ["<missing element 1>", ...],
  "venue_suggestions": ["<venue name and why>", ...],
  "reviewer_perspective": "<what a reviewer would say in meta-review, 2 paragraphs>"
}}

Be honest, constructive, and specific. Overall score: 8+ = accept, 6-8 = major revision, 4-6 = reject + resubmit, <4 = reject."""


async def generate_review(file_bytes: bytes) -> ReviewResult:
    """
    Full pipeline:
    1. Parse PDF
    2. Build vector store
    3. Gather web context
    4. Review each section
    5. Generate overall review
    6. Assemble ReviewResult
    """
    # Step 1: Parse PDF
    paper = parse_paper(file_bytes)

    # Step 2: Build RAG vector store
    chunks = get_paper_chunks(paper["sections"])
    store = PaperVectorStore()
    if chunks:
        store.build(chunks)

    # Step 3: Detect domain and gather web context
    domain = _detect_domain(paper)
    web_context = await gather_review_context(
        paper_title=paper["title"],
        domain=domain,
        section_names=paper["detected_sections"],
    )

    # Step 4: Review each detected section
    section_reviews_raw: Dict[str, dict] = {}
    section_feedbacks: List[SectionFeedback] = []

    for section_name, section_text in paper["sections"].items():
        if section_name in ("Preamble", "Full Paper") or len(section_text.strip()) < 50:
            continue

        # RAG: retrieve relevant chunks from the paper for context
        rag_results = store.query(f"evaluate the {section_name} section: strengths and weaknesses", top_k=3)
        rag_context = "\n---\n".join(r["text"][:500] for r in rag_results)

        # Pick most relevant web sources for this section
        if "method" in section_name.lower():
            web_sources = web_context.get("methodology_standards", [])
        elif "result" in section_name.lower() or "experiment" in section_name.lower():
            web_sources = web_context.get("evaluation_criteria", [])
        elif "related" in section_name.lower():
            web_sources = web_context.get("related_work", [])[:3]
        else:
            web_sources = web_context.get("writing_guidelines", [])

        web_ctx_str = _format_sources(web_sources)

        prompt = _review_section_prompt(
            section_name=section_name,
            section_text=section_text,
            rag_context=rag_context,
            web_context=web_ctx_str,
            domain=domain,
        )

        try:
            raw = _chat_complete([{"role": "user", "content": prompt}])
            review_data = json.loads(raw)
        except Exception as e:
            review_data = {
                "score": 5.0,
                "feedback": f"Could not generate detailed feedback for this section. Error: {str(e)}",
                "issues": [],
                "suggestions": [],
            }

        section_reviews_raw[section_name] = review_data

        section_feedbacks.append(
            SectionFeedback(
                name=section_name,
                present=True,
                score=float(review_data.get("score", 5.0)),
                feedback=review_data.get("feedback", ""),
                issues=review_data.get("issues", []),
                suggestions=review_data.get("suggestions", []),
                sources=web_sources[:3],
            )
        )

    # Add missing sections as absent entries
    for expected in EXPECTED_SECTIONS:
        if not any(expected.lower() in s.lower() for s in paper["sections"].keys()):
            section_feedbacks.append(
                SectionFeedback(
                    name=expected,
                    present=False,
                    score=0.0,
                    feedback=f"The {expected} section was not detected in the paper. This is a critical omission.",
                    issues=[f"{expected} section is missing or not clearly labeled"],
                    suggestions=[f"Add a clearly labeled {expected} section following standard academic conventions"],
                    sources=[],
                )
            )

    # Step 5: Overall review
    overall_prompt = _overall_review_prompt(paper, section_reviews_raw, web_context, domain)

    try:
        raw = _chat_complete([{"role": "user", "content": overall_prompt}])
        overall_data = json.loads(raw)
    except Exception as e:
        overall_data = {
            "review_summary": "Unable to generate overall review.",
            "overall_score": 5.0,
            "writing_quality_score": 5.0,
            "novelty_score": 5.0,
            "technical_rigor_score": 5.0,
            "critical_issues": [],
            "major_issues": [],
            "minor_issues": [],
            "missing_components": [],
            "venue_suggestions": [],
            "reviewer_perspective": str(e),
        }

    # Collect recommended citations from web search
    recommended_citations: List[WebSource] = []
    for sources in web_context.get("related_work", []):
        if isinstance(sources, WebSource):
            recommended_citations.append(sources)
    recommended_citations = recommended_citations[:5]

    return ReviewResult(
        paper_title=paper["title"] or "Untitled Paper",
        detected_domain=domain,
        overall_score=float(overall_data.get("overall_score", 5.0)),
        review_summary=overall_data.get("review_summary", ""),
        sections=section_feedbacks,
        critical_issues=overall_data.get("critical_issues", []),
        major_issues=overall_data.get("major_issues", []),
        minor_issues=overall_data.get("minor_issues", []),
        missing_components=overall_data.get("missing_components", []),
        recommended_citations=recommended_citations,
        venue_suggestions=overall_data.get("venue_suggestions", []),
        reviewer_perspective=overall_data.get("reviewer_perspective", ""),
        writing_quality_score=float(overall_data.get("writing_quality_score", 5.0)),
        novelty_score=float(overall_data.get("novelty_score", 5.0)),
        technical_rigor_score=float(overall_data.get("technical_rigor_score", 5.0)),
    )


async def generate_review_stream(file_bytes: bytes) -> AsyncGenerator[str, None]:
    """
    Streaming version: yields SSE-formatted progress + final result.

    All CPU-bound / blocking work is offloaded to a thread via asyncio.to_thread()
    so the event loop stays free between steps and SSE events flush immediately.
    """
    def sse(step: str, detail: str = "") -> str:
        return f"data: {json.dumps({'type': 'progress', 'step': step, 'detail': detail})}\n\n"

    # ── Step 1: Parse PDF ────────────────────────────────────────────────────
    yield sse("parsing", "Extracting text and identifying sections...")
    await asyncio.sleep(0)  # flush to client

    paper = await asyncio.to_thread(parse_paper, file_bytes)

    yield sse("parsing", f"Detected {len(paper['sections'])} sections · {paper['word_count']:,} words")
    await asyncio.sleep(0)

    # ── Step 2: Build vector index ───────────────────────────────────────────
    yield sse("embedding", "Building semantic vector index of the paper...")
    await asyncio.sleep(0)

    chunks = get_paper_chunks(paper["sections"])
    store = PaperVectorStore()

    def _build_store():
        if chunks:
            store.build(chunks)
        return len(chunks)

    n_chunks = await asyncio.to_thread(_build_store)

    yield sse("embedding", f"Indexed {n_chunks} text chunks")
    await asyncio.sleep(0)

    # ── Step 3: Grammar & Clarity check ─────────────────────────────────────
    yield sse("grammar_check", "Analysing writing clarity and grammar...")
    await asyncio.sleep(0)

    grammar_result = await asyncio.to_thread(check_grammar, paper, _chat_complete)

    issue_count = (
        len(grammar_result.passive_voice_instances)
        + len(grammar_result.complex_sentences)
        + len(grammar_result.undefined_acronyms)
        + len(grammar_result.hedging_phrases)
    )
    yield sse(
        "grammar_check",
        f"Clarity score: {grammar_result.clarity_score:.1f}/10 · {issue_count} writing issues found",
    )
    await asyncio.sleep(0)

    # ── Step 4: Web literature search ───────────────────────────────────────
    domain = _detect_domain(paper)
    yield sse("searching", f"Searching web for literature · domain: {domain}...")
    await asyncio.sleep(0)

    web_context = await gather_review_context(
        paper_title=paper["title"],
        domain=domain,
        section_names=paper["detected_sections"],
    )
    total_sources = sum(len(v) for v in web_context.values())

    yield sse("searching", f"Retrieved {total_sources} relevant web sources")
    await asyncio.sleep(0)

    # ── Step 4: Plagiarism check ─────────────────────────────────────────────
    yield sse("plagiarism", "Checking for matching content across the web...")
    await asyncio.sleep(0)

    plagiarism_result = await check_plagiarism(paper["sections"])

    yield sse(
        "plagiarism",
        f"Checked {plagiarism_result.checked_chunks} passages · "
        f"{len(plagiarism_result.flagged_passages)} flagged · "
        f"Risk: {plagiarism_result.risk_level}",
    )
    await asyncio.sleep(0)

    # ── Step 6: Citation validation ──────────────────────────────────────────
    yield sse("citation_check", "Verifying references against the web...")
    await asyncio.sleep(0)

    citation_result = await validate_citations(paper["sections"])

    yield sse(
        "citation_check",
        f"Verified {citation_result.verified_count}/{citation_result.total_parsed} citations · "
        f"{citation_result.unverified_count} could not be confirmed",
    )
    await asyncio.sleep(0)

    # ── Step 7: Section-by-section review ───────────────────────────────────
    section_reviews_raw: Dict[str, dict] = {}
    section_feedbacks: List[SectionFeedback] = []

    reviewable = {
        k: v for k, v in paper["sections"].items()
        if k not in ("Preamble", "Full Paper") and len(v.strip()) >= 50
    }

    for i, (section_name, section_text) in enumerate(reviewable.items()):
        yield sse("reviewing_section", f"Reviewing {i + 1}/{len(reviewable)}: {section_name}")
        await asyncio.sleep(0)

        # RAG retrieval (sync, fast — runs in thread anyway via store.query)
        rag_results = await asyncio.to_thread(
            store.query,
            f"evaluate the {section_name} section: strengths and weaknesses",
            3,
        )
        rag_context = "\n---\n".join(r["text"][:500] for r in rag_results)

        if "method" in section_name.lower():
            web_sources = web_context.get("methodology_standards", [])
        elif "result" in section_name.lower() or "experiment" in section_name.lower():
            web_sources = web_context.get("evaluation_criteria", [])
        elif "related" in section_name.lower():
            web_sources = web_context.get("related_work", [])
        else:
            web_sources = web_context.get("writing_guidelines", [])

        prompt = _review_section_prompt(section_name, section_text, rag_context,
                                        _format_sources(web_sources), domain)

        try:
            raw = await asyncio.to_thread(
                _chat_complete, [{"role": "user", "content": prompt}]
            )
            review_data = json.loads(raw)
        except Exception as e:
            review_data = {"score": 5.0, "feedback": str(e), "issues": [], "suggestions": []}

        section_reviews_raw[section_name] = review_data
        section_feedbacks.append(
            SectionFeedback(
                name=section_name,
                present=True,
                score=float(review_data.get("score", 5.0)),
                feedback=review_data.get("feedback", ""),
                issues=review_data.get("issues", []),
                suggestions=review_data.get("suggestions", []),
                sources=web_sources[:3],
            )
        )

    # Add absent sections
    for expected in EXPECTED_SECTIONS:
        if not any(expected.lower() in s.lower() for s in paper["sections"].keys()):
            section_feedbacks.append(
                SectionFeedback(
                    name=expected,
                    present=False,
                    score=0.0,
                    feedback=f"The {expected} section was not detected. This is a critical omission.",
                    issues=[f"{expected} section is missing or not clearly labeled"],
                    suggestions=[f"Add a clearly labeled {expected} section"],
                    sources=[],
                )
            )

    # ── Step 8: Overall assessment ───────────────────────────────────────────
    yield sse("overall", "Generating overall assessment and recommendations...")
    await asyncio.sleep(0)

    overall_prompt = _overall_review_prompt(paper, section_reviews_raw, web_context, domain)

    try:
        raw = await asyncio.to_thread(
            _chat_complete, [{"role": "user", "content": overall_prompt}]
        )
        overall_data = json.loads(raw)
    except Exception as e:
        overall_data = {
            "review_summary": "Review generation failed.",
            "overall_score": 5.0,
            "writing_quality_score": 5.0,
            "novelty_score": 5.0,
            "technical_rigor_score": 5.0,
            "critical_issues": [],
            "major_issues": [],
            "minor_issues": [],
            "missing_components": [],
            "venue_suggestions": [],
            "reviewer_perspective": str(e),
        }

    recommended_citations = web_context.get("related_work", [])[:5]

    result = ReviewResult(
        paper_title=paper["title"] or "Untitled Paper",
        detected_domain=domain,
        overall_score=float(overall_data.get("overall_score", 5.0)),
        review_summary=overall_data.get("review_summary", ""),
        sections=section_feedbacks,
        critical_issues=overall_data.get("critical_issues", []),
        major_issues=overall_data.get("major_issues", []),
        minor_issues=overall_data.get("minor_issues", []),
        missing_components=overall_data.get("missing_components", []),
        recommended_citations=recommended_citations,
        venue_suggestions=overall_data.get("venue_suggestions", []),
        reviewer_perspective=overall_data.get("reviewer_perspective", ""),
        writing_quality_score=float(overall_data.get("writing_quality_score", 5.0)),
        novelty_score=float(overall_data.get("novelty_score", 5.0)),
        technical_rigor_score=float(overall_data.get("technical_rigor_score", 5.0)),
        plagiarism=plagiarism_result,
        grammar=grammar_result,
        citations=citation_result,
    )

    yield f"data: {json.dumps({'type': 'result', 'data': result.model_dump()})}\n\n"
    await asyncio.sleep(0)
    yield "data: [DONE]\n\n"
