# ReviewX - Design Document

**Project:** Intelligent Pre-Submission Paper Review System
**Hackathon Topic:** Topic 4 - Paper Review System
**Version:** 1.0



---

## Table of Contents

1. Problem Statement
2. Solution Overview
3. System Architecture
4. RAG Pipeline Design
5. Component Specifications
6. Data Models
7. API Design
8. Frontend Design
9. Codebase File Reference
10. Technology Stack
11. Design Decisions and Trade-offs
12. Limitations and Future Work

---

## 1. Problem Statement

Research papers are frequently rejected during initial peer review due to issues
that could have been identified and corrected before submission:

- Missing or incomplete sections (abstract, related work, limitations)
- Unclear methodology with insufficient reproducibility detail
- Lack of comparison with baselines or related work
- Weak experimental evaluation (missing ablation studies, statistical significance)
- Poor writing quality and structural clarity

These rejections are costly -- they delay research dissemination by 3-12 months per
review cycle. A pre-submission review tool that simulates expert peer review can
significantly improve the quality and acceptance rate of submitted papers.

**Core challenge:** A naive LLM call is insufficient because the model lacks
(a) deep knowledge of the specific paper's content, and (b) awareness of current
literature in the exact sub-field. Both are solved by RAG.

---

## 2. Solution Overview

**ReviewX** is a web application that accepts a research paper PDF and returns
structured, expert-level feedback -- before the author submits to a conference or journal.

### Key Differentiators

| Aspect               | Naive Approach              | ReviewX                          |
|----------------------|-----------------------------|----------------------------------------|
| Paper understanding  | Dump full text into LLM     | Segment into sections, vector index    |
| Literature awareness | None                        | Live web retrieval per section         |
| Feedback structure   | Free-form text              | Scored sections + issue severity tiers |
| Feedback grounding   | Hallucinated                | Grounded in retrieved sources (cited)  |
| UX                   | Static results              | Live streaming progress, interactive   |

### User Flow

```
Upload PDF -> Live progress stream -> Interactive review report -> Download .txt
    |                |                          |
  < 2 sec       30-120 sec           Section scores, issues,
                                     suggestions, citations
```

---

## 3. System Architecture

```
+------------------------------------------------------------------+
|                        CLIENT (Browser)                          |
|                                                                  |
|  +-------------+   SSE Stream    +------------------------+     |
|  | Upload Zone | --------------> | Processing Status      |     |
|  | (PDF upload)|                 | (live 5-step tracker)  |     |
|  +-------------+                 +------------------------+     |
|                                             |                    |
|                                             v                    |
|                                  +------------------------+     |
|                                  |   Review Display       |     |
|                                  |   - Score rings        |     |
|                                  |   - Section cards      |     |
|                                  |   - Issues list        |     |
|                                  |   - Web sources        |     |
|                                  +------------------------+     |
+----------------------------+-------------------------------------+
                             |
                             | HTTP POST multipart/form-data
                             | Response: text/event-stream (SSE)
                             v
+------------------------------------------------------------------+
|                    FastAPI Backend (port 8000)                    |
|                                                                  |
|  POST /api/review                                                |
|       |                                                          |
|       v                                                          |
|  +------------------------------------------------------------+  |
|  |             Review Generator (Orchestrator)                |  |
|  |                                                            |  |
|  |  +------------+  +--------------+  +------------------+   |  |
|  |  | PDF Parser |  |  RAG Engine  |  |   Web Search     |   |  |
|  |  |            |  |              |  |                  |   |  |
|  |  | - PyMuPDF  |  | - fastembed  |  | - Tavily API     |   |  |
|  |  | - Section  |  |   ONNX model |  | - DuckDuckGo     |   |  |
|  |  |   detect   |  | - Cosine sim |  |   (fallback)     |   |  |
|  |  | - Chunking |  | - In-memory  |  | - 5 parallel     |   |  |
|  |  +-----+------+  +------+-------+  |   queries        |   |  |
|  |        |                |          +--------+---------+   |  |
|  |        +----------------+-----------        |             |  |
|  |                         |                   |             |  |
|  |                         v                   |             |  |
|  |                  +--------------+           |             |  |
|  |                  |  LLM Client  | <---------+             |  |
|  |                  |              |                         |  |
|  |                  | Groq API     |                         |  |
|  |                  | (primary)    |                         |  |
|  |                  |              |                         |  |
|  |                  | OpenAI API   |                         |  |
|  |                  | (fallback)   |                         |  |
|  |                  +--------------+                         |  |
|  +------------------------------------------------------------+  |
+------------------------------------------------------------------+
```

---

## 4. RAG Pipeline Design

The RAG (Retrieval-Augmented Generation) pipeline is the core innovation. It solves
two distinct retrieval problems simultaneously.

### 4.1 Intra-Document RAG (Paper -> Chunks)

Used to retrieve the most semantically relevant parts of the paper when generating
feedback for a given section or criterion.

```
Paper PDF
    |
    v
[PDF Parser] -> Raw Text + Section Labels
    |
    v
[Chunker] -> Overlapping chunks (800 words, 100-word overlap)
    |            per section with metadata
    v
[Embedder] -> fastembed BAAI/bge-small-en-v1.5
    |            384-dim dense vectors (local ONNX, no API)
    v
[In-Memory Store] -> List of (chunk, embedding) pairs
    |
    v
[Query] "Evaluate methodology section: strengths and weaknesses"
    |
    v
[Cosine Similarity] -> Top-3 relevant chunks
    |
    v
[LLM Context] -> Grounded, paper-specific feedback
```

**Why intra-document RAG?**
Without it, the LLM must process the full paper in a single prompt (expensive,
context-limited, less focused). With RAG, each section review receives the 3 most
relevant paper segments as supporting context, making feedback more specific and accurate.

### 4.2 Web RAG (Query -> Live Literature)

Used to retrieve current standards, related work, and best practices from the web
to ground the review in external knowledge.

```
Paper Metadata (title, domain, sections)
    |
    v
[Query Generator] -> 5 targeted search queries:
    |                  1. Related work  (title + "research 2022-2024")
    |                  2. Methodology standards (domain-specific)
    |                  3. Evaluation criteria (peer review standards)
    |                  4. Writing guidelines (IEEE/ACM standards)
    |                  5. Novelty check (prior work)
    v
[Web Search] -> Tavily (primary) -> DuckDuckGo (fallback)
    |             5 parallel async queries
    v
[Source Routing] -> Each section gets its relevant sources:
    |                 Methodology   -> methodology_standards
    |                 Results       -> evaluation_criteria
    |                 Related Work  -> related_work
    |                 Others        -> writing_guidelines
    v
[LLM Context] -> Externally grounded, up-to-date feedback
                 with clickable cited sources in the UI
```

### 4.3 Combined Generation

For each section, the LLM receives four inputs combined into one prompt:

```
+-----------------------------------------------------+
|              Section Review Prompt                  |
|                                                     |
|  [1] Section text (up to 3000 chars)                |
|  [2] Top-3 RAG chunks from the paper (context)      |
|  [3] Top-3 web sources (external grounding)         |
|  [4] Domain-specific review criteria                |
|                                                     |
|  Output: JSON { score, feedback, issues,            |
|                 suggestions }                       |
+-----------------------------------------------------+
```

---

## 5. Component Specifications

### 5.1 PDF Parser (services/pdf_parser.py)

**Responsibilities:**
- Extract raw text from PDF using PyMuPDF
- Detect and label paper sections via regex pattern matching
- Extract paper metadata (title, abstract, keywords)
- Produce overlapping text chunks for embedding

**Section Detection Strategy:**
Regex patterns match common academic section headings regardless of numbering
scheme (e.g., "1. Introduction", "Introduction", "II. INTRODUCTION"):

| Target Section | Patterns Matched                                        |
|----------------|---------------------------------------------------------|
| Abstract       | abstract                                                |
| Introduction   | introduction, 1. introduction                           |
| Related Work   | related work, background, literature review             |
| Methodology    | methodology, method, approach, proposed, system design  |
| Results        | experiment, evaluation, results, performance            |
| Discussion     | discussion                                              |
| Conclusion     | conclusion, summary, future work                        |
| References     | references, bibliography                                |

**Chunking Parameters:**
- Chunk size: 800 words
- Overlap: 100 words
- Minimum chunk length: 50 characters (filtered)

### 5.2 RAG Engine (services/rag_engine.py)

**Responsibilities:**
- Embed text chunks using local ONNX model (no API cost)
- Store embeddings in-memory per request (stateless)
- Answer semantic queries over the paper

**Embedding Backend (priority order):**

1. fastembed with BAAI/bge-small-en-v1.5
   - 384-dimensional dense vectors
   - ONNX runtime (no PyTorch dependency)
   - ~100 MB model, loads once per process

2. TF-IDF fallback (scikit-learn)
   - 512 features, cosine similarity
   - Zero additional dependencies
   - Adequate for domain-specific technical text

**Similarity Metric:** Cosine similarity with epsilon=1e-10 numerical stability guard

### 5.3 Web Search (services/web_search.py)

**Responsibilities:**
- Run 5 targeted parallel async searches per paper review
- Route results to the appropriate sections

**Provider Cascade:**

```
Request
  |
  +-> Tavily API (if TAVILY_API_KEY is set)
  |     search_depth="basic", max_results=3
  |     Returns: title, url, content snippet (400 chars)
  |
  +-> DuckDuckGo (if Tavily unavailable or fails)
        Free, no API key required, max_results=3
        Returns: title, href, body snippet (400 chars)
```

**Search Queries Generated:**

| Query Type           | Template                                                  |
|----------------------|-----------------------------------------------------------|
| related_work         | {title} related work research 2022 2023 2024              |
| methodology_standards| best practices methodology section research paper {domain}|
| evaluation_criteria  | research paper evaluation criteria peer review {domain}   |
| writing_guidelines   | academic research paper writing guidelines IEEE ACM       |
| novelty_check        | {title} prior work existing approaches                    |

### 5.4 Review Generator (services/review_generator.py)

**Responsibilities:**
- Orchestrate the full pipeline end-to-end
- Detect research domain from paper content
- Generate per-section reviews with structured JSON output
- Generate overall assessment
- Stream SSE progress events to client

**Domain Detection:**
Keyword-frequency classification across 8 domains:
- Machine Learning / Deep Learning
- Computer Vision
- Natural Language Processing
- Cybersecurity
- Databases / Data Management
- Networking / Systems
- Bioinformatics
- Robotics

Falls back to "Computer Science / Engineering" if no strong signal.

**LLM Backend Selection:**

```
Check environment variables in order:

  GROQ_API_KEY set?
    YES -> use Groq API, model: llama-3.3-70b-versatile (free tier)
    NO  ->
      OPENAI_API_KEY set?
        YES -> use OpenAI API, model: gpt-4o-mini (paid)
        NO  -> raise error: no LLM configured
```

**Section Review Prompt Design:**
- Temperature: 0.3 (low for consistent, factual feedback)
- Response format: json_object (structured output enforced)
- JSON schema: `{ score: float, feedback: str, issues: str[], suggestions: str[] }`
- Score rubric: 8+ accept, 6-8 needs work, 4-6 major issues, below 4 critical

**Streaming Protocol:**
The endpoint streams SSE events as each pipeline step completes:

```
data: {"type": "progress", "step": "parsing",           "detail": "Extracting..."}
data: {"type": "progress", "step": "embedding",         "detail": "Indexed N chunks"}
data: {"type": "progress", "step": "searching",         "detail": "Domain: ..."}
data: {"type": "progress", "step": "reviewing_section", "detail": "Section 2/6: ..."}
data: {"type": "progress", "step": "overall",           "detail": "Generating..."}
data: {"type": "result",   "data": { ...ReviewResult... }}
data: [DONE]
```

---

## 6. Data Models

### WebSource

```
title   : str   - Title of the retrieved web page
url     : str   - Source URL (linked in UI)
snippet : str   - Relevant excerpt (max 400 chars)
```

### SectionFeedback

```
name        : str             - Section name (e.g., "Methodology")
present     : bool            - Whether section was detected in paper
score       : float (0-10)    - Section quality score
feedback    : str             - 2-3 paragraph expert review
issues      : list of str     - Specific problems identified
suggestions : list of str     - Actionable improvement steps
sources     : list of WebSource - Supporting web sources cited
```

### ReviewResult

```
paper_title           : str           - Extracted paper title
detected_domain       : str           - Classified research domain
overall_score         : float (0-10)  - Aggregate review score
review_summary        : str           - 3-4 sentence executive summary
sections              : list of SectionFeedback
critical_issues       : list of str   - Blocking / rejection-level issues
major_issues          : list of str   - Significant issues requiring revision
minor_issues          : list of str   - Polish and clarity improvements
missing_components    : list of str   - Required sections not found
recommended_citations : list of WebSource - Suggested papers to cite
venue_suggestions     : list of str   - Suitable conferences/journals
reviewer_perspective  : str           - Meta-reviewer summary paragraph
writing_quality_score : float (0-10)
novelty_score         : float (0-10)
technical_rigor_score : float (0-10)
```

---

## 7. API Design

### POST /api/review

Upload a PDF for review. Returns a Server-Sent Event stream.

**Request:**
```
Content-Type: multipart/form-data
Body field:   file = <PDF binary>
Constraints:  PDF only, maximum 20 MB
```

**Response:** text/event-stream

```
HTTP/1.1 200 OK
Content-Type: text/event-stream
Cache-Control: no-cache
X-Accel-Buffering: no

data: {"type": "progress", "step": "parsing", "detail": "..."}
data: {"type": "progress", "step": "embedding", "detail": "..."}
...
data: {"type": "result", "data": { <ReviewResult JSON> }}
data: [DONE]
```

**Error responses:**

| Code | Condition                            |
|------|--------------------------------------|
| 400  | Non-PDF file or file larger than 20 MB |
| 503  | No LLM API key configured            |
| 500  | Unexpected internal error            |

### GET /api/health

```json
{
  "status": "ok",
  "openai_configured": false,
  "tavily_configured": true
}
```

---

## 8. Frontend Design

### Component Tree

```
App  (src/App.tsx)
|-- Navbar
|   +-- Brand logo + "ReviewX" name + RAG badge
|
|-- UploadZone  (src/components/UploadZone.tsx)  [state: idle]
|   |-- Hero heading "Meet ReviewX"
|   |-- Drag-and-drop PDF upload zone
|   +-- Feature cards (RAG Analysis / Live Literature / Structured Feedback)
|
|-- ProcessingStatus  (src/components/ProcessingStatus.tsx)  [state: processing]
|   |-- Animated icon with spinner
|   +-- 5-step tracker: parsing -> embedding -> searching -> reviewing -> overall
|
|-- ReviewDisplay  (src/components/ReviewDisplay.tsx)  [state: done]
|   |-- Action bar (New review button / Download Report button)
|   |-- Hero card
|   |   |-- Paper title + domain badge
|   |   |-- Review summary text
|   |   |-- ScoreRing (overall score animated SVG ring)
|   |   |-- Verdict banner (Accept / Major Revision / Reject)
|   |   +-- Sub-score bars (Writing / Rigor / Novelty)
|   |-- Issues summary (Critical / Major / Minor)
|   |-- Section cards  (src/components/SectionCard.tsx)
|   |   |-- Header: present icon, section name, score bar, numeric score
|   |   +-- Expanded: Feedback text + Issues + Suggestions + Web sources
|   |-- Venue suggestions
|   |-- Recommended citations (from web retrieval)
|   +-- Area chair perspective (collapsible)
|
+-- ErrorState  [state: error]
    |-- Error message display
    +-- "Try Again" button
```

### Scoring Color System

| Score      | Color   | Hex     | Verdict           |
|------------|---------|---------|-------------------|
| 8.0 - 10.0 | Green   | #22c55e | Accept            |
| 6.0 - 7.9  | Amber   | #f59e0b | Major Revision    |
| 4.0 - 5.9  | Orange  | #f97316 | Reject & Resubmit |
| 0.0 - 3.9  | Red     | #ef4444 | Reject            |

### Streaming UX

The frontend connects via fetch() with a ReadableStream reader. SSE "progress"
events update the step tracker in real time as each pipeline stage completes.
The final "result" event triggers a state transition from "processing" to "done"
with a fade-in animation on the review display.

---

## 9. Codebase File Reference

### Backend Files

```
backend/main.py
    Entry point for the FastAPI application. Defines two API routes:
    POST /api/review (streaming review) and GET /api/health. Configures
    CORS to allow requests from the frontend, and checks for API key
    availability on startup. The /api/review handler reads the uploaded
    PDF, validates it, then streams SSE events from generate_review_stream.

backend/requirements.txt
    Lists all Python package dependencies with pinned versions. Install
    with: pip install -r requirements.txt

backend/.env.example
    Template showing all supported environment variables. Copy this to
    .env and fill in your API keys before running the server.

backend/models/__init__.py
    Empty file that makes the models/ directory a Python package so it
    can be imported with "from models.schemas import ...".

backend/models/schemas.py
    Defines the three Pydantic data models used throughout the backend:
    WebSource (a retrieved web result), SectionFeedback (review of one
    paper section), and ReviewResult (the complete review output). These
    models also handle automatic JSON serialization for the API response.

backend/services/__init__.py
    Empty file that makes the services/ directory a Python package.

backend/services/pdf_parser.py
    Handles all PDF processing. Uses PyMuPDF to extract raw text page by
    page. Then runs regex patterns to identify section headings and split
    the text into labeled sections (Abstract, Introduction, etc.). Also
    extracts the paper title and abstract from the opening pages. Finally,
    splits each section into overlapping 800-word chunks for embedding.

backend/services/rag_engine.py
    Implements the in-memory vector store for the paper chunks. On startup,
    it tries to load fastembed with the BAAI/bge-small-en-v1.5 ONNX model
    for dense 384-dim embeddings. If fastembed is unavailable, it falls back
    to TF-IDF vectors from scikit-learn. The PaperVectorStore class builds
    an index from chunks and answers semantic queries using cosine similarity
    to return the top-k most relevant chunks.

backend/services/web_search.py
    Runs web searches to retrieve current literature and standards relevant
    to the paper being reviewed. Tries Tavily first (if TAVILY_API_KEY is
    set) for high-quality RAG-optimized results. Falls back to DuckDuckGo
    if Tavily is unavailable. Generates 5 targeted queries per paper covering
    related work, methodology standards, evaluation criteria, writing guidelines,
    and novelty checking, all run as async tasks.

backend/services/review_generator.py
    The main orchestrator. Calls pdf_parser, rag_engine, and web_search in
    sequence and feeds their outputs into the LLM. Detects the research domain
    using keyword frequency. Selects Groq or OpenAI as the LLM backend based
    on which API key is present. For each paper section, builds a combined prompt
    with the section text, RAG-retrieved paper chunks, and web sources, then
    parses the LLM JSON response into a SectionFeedback object. Finally generates
    an overall ReviewResult. The streaming version (generate_review_stream) uses
    asyncio.to_thread for all blocking calls and yields SSE events between steps
    so the frontend receives live progress updates.
```

### Frontend Files

```
frontend/index.html
    The single HTML page that bootstraps the React app. Sets the browser
    tab title to "ReviewX - Pre-Submission Paper Review" and the meta
    description for search engines. Loads src/main.tsx as the entry module.

frontend/vite.config.ts
    Configures the Vite build tool. Sets the dev server port to 5173 and
    adds a proxy rule so requests to /api/* are forwarded to the backend
    at localhost:8000 during development, avoiding CORS issues.

frontend/tailwind.config.js
    Configures Tailwind CSS. Points the content scanner at all .tsx files
    in src/ so Tailwind only includes styles that are actually used. Adds
    custom animation keyframes (fadeIn, slideUp) used in the review display.

frontend/postcss.config.js
    PostCSS configuration that enables the Tailwind and Autoprefixer plugins.
    Required by Vite to process the Tailwind @tailwind directives in index.css.

frontend/package.json
    Node.js project manifest listing all frontend dependencies (React,
    TypeScript, Vite, Tailwind, lucide-react) and scripts (dev, build, lint).

frontend/src/main.tsx
    The React bootstrap file. Creates a root React DOM node, wraps the App
    component in React.StrictMode, and mounts it into the #root div in index.html.

frontend/src/App.tsx
    The root component and the application's state machine. Manages four states:
    idle (show upload), processing (show progress), done (show review), error
    (show error message). Handles file selection, calls the backend API, reads
    the SSE stream from the server, dispatches progress events to ProcessingStatus,
    and the final result event to ReviewDisplay. Also renders the navbar and footer.

frontend/src/index.css
    Global stylesheet. Imports the Google Fonts Inter font family. Contains the
    three Tailwind directives (@tailwind base/components/utilities). Defines a
    custom scrollbar style and a score-ring SVG stroke animation.

frontend/src/types/review.ts
    TypeScript interface definitions that mirror the backend Pydantic models:
    WebSource, SectionFeedback, ReviewResult, and the SSE event union types
    (ProgressEvent, ResultEvent, StreamEvent). Keeps the frontend type-safe
    against the API response shape.

frontend/src/components/UploadZone.tsx
    The landing screen shown in the idle state. Renders the "Meet ReviewX"
    hero heading, a drag-and-drop zone that accepts PDF files, and three feature
    cards. Validates that the selected file is a PDF and under 20 MB before
    passing it up to App via the onFileSelect callback.

frontend/src/components/ProcessingStatus.tsx
    Shown while the backend is processing. Displays a 5-step tracker:
    parsing, embedding, searching, reviewing_section, and overall. Each step
    shows a green checkmark when done, a spinning loader when active, and a
    dim circle when pending. The active step also shows the live detail text
    received from the SSE stream. All blocking backend work is done in threads
    so steps update in real time as each stage completes.

frontend/src/components/ReviewDisplay.tsx
    The main results screen shown after the review completes. Contains the
    action bar (new review + download), the hero card with the overall score
    ring and verdict banner, sub-score bars for writing/rigor/novelty, the
    issues summary panel, all section cards, venue suggestions, recommended
    citations, and the collapsible area chair perspective panel. The download
    button exports the full review as a plain text file.

frontend/src/components/SectionCard.tsx
    A collapsible card representing one reviewed paper section. The header
    shows whether the section was detected, its name, an animated score bar,
    and the numeric score. When expanded, shows the full feedback paragraph,
    a list of specific issues, a list of actionable suggestions, and any
    web sources retrieved for that section with clickable links.

frontend/src/components/ScoreRing.tsx
    A reusable SVG component that draws an animated circular ring to represent
    a score from 0 to 10. The ring color is green for 8+, amber for 6-8,
    orange for 4-6, and red below 4. Used for the overall score in the hero
    card. Also exports the getColor and getVerdict helper functions used by
    other components for consistent color coding.
```

---

## 10. Technology Stack

### Backend

| Layer              | Technology                    | Rationale                                  |
|--------------------|-------------------------------|--------------------------------------------|
| Web framework      | FastAPI 0.115                 | Async-native, SSE support, auto-docs       |
| ASGI server        | uvicorn + uvloop              | High-throughput async I/O                  |
| PDF parsing        | PyMuPDF (fitz)                | Fast, reliable text extraction with layout |
| Embeddings         | fastembed 0.4 (ONNX)         | No PyTorch, local, free; TF-IDF fallback   |
| LLM (primary)      | Groq llama-3.3-70b            | Free tier, fast inference, JSON mode       |
| LLM (fallback)     | OpenAI gpt-4o-mini            | High quality, widely available             |
| Web search primary | Tavily API                    | RAG-optimized, clean snippets              |
| Web search backup  | DuckDuckGo                    | Zero cost, no API key needed               |
| Data validation    | Pydantic v2                   | Schema enforcement, serialization          |
| Numerics           | NumPy                         | Cosine similarity computations             |

### Frontend

| Layer       | Technology                  | Rationale                              |
|-------------|-----------------------------|----------------------------------------|
| Framework   | React 18 + TypeScript       | Type safety, component model           |
| Build tool  | Vite 4                      | Fast HMR, compatible with Node 18      |
| Styling     | Tailwind CSS v3             | Utility-first, dark theme              |
| Icons       | lucide-react                | Lightweight, consistent SVG icons      |
| HTTP / SSE  | Fetch API + ReadableStream  | Native browser, no library needed      |

---

## 11. Design Decisions and Trade-offs

### Decision 1: SSE over WebSockets

**Choice:** Server-Sent Events for the review stream
**Alternatives considered:** WebSockets, polling, long-poll
**Rationale:** SSE is unidirectional (server to client only), which is exactly what
streaming review progress requires. It is simpler to implement, works over HTTP/1.1,
and is natively supported by fetch() without libraries. WebSockets add bidirectional
complexity that is not needed here.

### Decision 2: Local Embeddings over Cloud Embeddings

**Choice:** fastembed (ONNX) with TF-IDF fallback
**Alternatives considered:** OpenAI text-embedding-3-small, Cohere embeddings
**Rationale:** The primary goal is zero-cost, zero-dependency embeddings. For
within-paper retrieval where all documents are in the same technical domain, a smaller
local model performs comparably to large cloud embeddings. The TF-IDF fallback ensures
the system works even without any embedding infrastructure.

### Decision 3: Per-Request Vector Store (Stateless)

**Choice:** Build a fresh in-memory vector store for each uploaded paper
**Alternatives considered:** Persistent vector DB (ChromaDB, Qdrant), Redis cache
**Rationale:** For a single-user hackathon demo, stateless per-request processing
eliminates infrastructure overhead. Each paper has a different chunk set, so caching
would provide minimal benefit without a user identity model.

### Decision 4: JSON Mode for LLM Output

**Choice:** response_format {"type": "json_object"} on all LLM calls
**Alternatives considered:** Regex parsing of markdown, Pydantic validators on raw text
**Rationale:** JSON mode guarantees parseable output and eliminates the most common
failure mode in LLM pipelines (malformed responses). Both Groq and OpenAI support this.
Temperature 0.3 further reduces hallucination while preserving natural language quality.

### Decision 5: Section-by-Section Review over Holistic Review

**Choice:** Review each section individually, then synthesize an overall assessment
**Alternatives considered:** Single pass over full paper, multi-turn conversation
**Rationale:** Section-level reviews are more actionable (authors can fix individual
sections), more accurate (focused prompts outperform broad ones), and allow targeted
web RAG retrieval per section. The synthesis step produces the holistic view from the
structured section scores.

### Decision 6: asyncio.to_thread for Blocking Calls in SSE Stream

**Choice:** Wrap all synchronous operations (PDF parsing, embedding, LLM calls) in
asyncio.to_thread() inside the async generator
**Alternatives considered:** Running everything synchronously, using a background task
**Rationale:** Without this, all SSE progress events buffer until the entire pipeline
finishes (the event loop is blocked). asyncio.to_thread() offloads each heavy operation
to a thread pool, freeing the event loop between steps so SSE events flush immediately.

---

## 12. Limitations and Future Work

### Current Limitations

| Limitation                          | Impact                             | Root Cause                    |
|-------------------------------------|------------------------------------|-------------------------------|
| Section detection is regex-based    | May miss unusual paper formats     | No ML layout detection        |
| Single paper per request            | No comparison across revisions     | No persistent storage         |
| Web search is sequential per query  | Adds 5-15 sec latency              | Async but not truly parallel  |
| No multi-column PDF layout support  | Text extraction may be disordered  | PyMuPDF limitation            |
| Review quality depends on LLM quota | Fails if API quota is exceeded     | External API dependency       |

### Future Enhancements

1. **Revision Tracking** - Upload two versions of a paper to see which issues were
   addressed between drafts

2. **Venue-Specific Review** - Select a target conference (NeurIPS, CVPR, ACL) and
   apply its specific review rubric and formatting guidelines

3. **Citation Graph Analysis** - Cross-reference the paper's bibliography against a
   citation database to flag highly cited missing works

4. **Persistent History** - User accounts with review history and downloadable PDF
   reports

5. **Collaborative Review** - Share review links with co-authors and annotate feedback
   inline

6. **Fine-tuned Reviewer Model** - Fine-tune on accepted/rejected paper pairs from
   OpenReview to calibrate scoring more accurately

7. **Multi-language Support** - Reviews for papers written in languages other than
   English
