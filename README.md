# ReviewX - Intelligent Pre-Submission Paper Review System

Hackathon Topic 4: RAG-powered research paper review that analyzes submissions,
retrieves relevant literature, and provides structured expert feedback before submission.

---

## What It Does

The ReviewX uses Retrieval-Augmented Generation (RAG) to give research authors
deep, actionable feedback on their papers before they submit -- the kind of feedback
usually only received after peer review rejection.

### How the RAG pipeline works

1. **PDF Parsing** - Extracts full text and segments it into labeled sections
   (Abstract, Introduction, Methodology, Results, etc.)

2. **Vector Indexing** - Embeds all paper chunks locally using fastembed (ONNX,
   no API cost) and stores them in an in-memory vector store

3. **Live Web Retrieval** - Searches the web (via Tavily or DuckDuckGo) for related
   papers, domain standards, and best practices for each section

4. **Section-by-Section Review** - For each section, the system:
   - Retrieves semantically similar chunks from the paper (RAG)
   - Retrieves relevant web context (literature, standards)
   - Generates structured feedback with issues and suggestions

5. **Overall Assessment** - Synthesizes all sections into an overall score, verdict
   (Accept / Major Revision / Reject), and reviewer perspective

### Output

- Section-by-section scores and feedback
- Critical / Major / Minor issues
- Writing quality, technical rigor, and novelty sub-scores
- Suggested venue submissions
- Recommended citations from web retrieval
- Area chair meta-review perspective
- Downloadable report

---

## Getting Your API Keys

### Groq API Key (Required - Free)

Groq provides fast LLM inference at no cost on their free tier.

1. Go to https://console.groq.com
2. Click "Sign Up" and create a free account
3. After logging in, click "API Keys" in the left sidebar
4. Click "Create API Key", give it a name, and copy the key
5. It starts with `gsk_`
6. Paste it into `backend/.env` as `GROQ_API_KEY=gsk_...`

The free tier is generous and more than enough for the hackathon.

### Tavily API Key (Optional but Recommended)

Tavily powers the web literature search. Without it, the system falls back to
DuckDuckGo which is free but returns lower-quality results.

1. Go to https://app.tavily.com
2. Click "Sign Up" and create a free account
3. After logging in, your API key is shown on the dashboard
4. It starts with `tvly-`
5. Paste it into `backend/.env` as `TAVILY_API_KEY=tvly-...`

The free tier allows 1000 searches per month, which is plenty for demos.

### OpenAI API Key (Optional - Paid fallback)

Only needed if you do not have a Groq key. Requires a paid account.

1. Go to https://platform.openai.com
2. Log in and click your profile -> "API keys"
3. Click "Create new secret key" and copy it
4. It starts with `sk-`
5. Paste it into `backend/.env` as `OPENAI_API_KEY=sk-...`

---

## Tech Stack

| Layer            | Technology                                            |
|------------------|-------------------------------------------------------|
| Frontend         | React + TypeScript + Vite + Tailwind CSS              |
| Backend          | Python FastAPI + uvicorn                              |
| LLM              | Groq llama-3.3-70b-versatile (free) / OpenAI fallback |
| Embeddings       | fastembed ONNX (BAAI/bge-small-en-v1.5) - local       |
| Vector Store     | In-memory cosine similarity store                     |
| PDF Parsing      | PyMuPDF (fitz)                                        |
| Web Search       | Tavily (primary) / DuckDuckGo (fallback)              |
| Streaming        | Server-Sent Events (SSE)                              |

---

## Setup and Running

### Prerequisites

- Python 3.10 or higher
- Node.js 18 or higher
- Groq API key (free, see above)
- Tavily API key (optional, see above)

### 1. Backend


```bash
cd backend
cp .env.example .env
# Open .env and fill in your GROQ_API_KEY (and optionally TAVILY_API_KEY)
pip install -r requirements.txt
#if it gives error Make env using this command (source env/bin/activate)

uvicorn main:app --reload --port 8000
```

### 2. Frontend

```bash
cd frontend
npm install
npm run dev
# Opens at http://localhost:5173
```

### 3. Usage

1. Open http://localhost:5173
2. Drag and drop or click to upload your research paper PDF
3. Watch the live progress as ReviewX:
   - Parses and indexes your paper
   - Searches the web for related literature
   - Reviews each section with LLM feedback
4. Explore the interactive review report
5. Click "Download Report" to save a plain text copy

---

## Project Structure

```
backend/
    main.py                  FastAPI app, API routes, CORS config
    requirements.txt         Python dependencies
    .env.example             Template for environment variables
    models/
        schemas.py           Pydantic data models
    services/
        pdf_parser.py        PDF extraction and section detection
        rag_engine.py        Local embeddings and vector search
        web_search.py        Tavily / DuckDuckGo integration
        review_generator.py  RAG pipeline orchestrator + SSE streaming

frontend/
    index.html               HTML entry point and page title
    vite.config.ts           Build config and dev server proxy
    tailwind.config.js       Tailwind CSS theme configuration
    src/
        main.tsx             React app bootstrap
        App.tsx              Root component and app state machine
        index.css            Global styles and animations
        types/
            review.ts        TypeScript types for API responses
        components/
            UploadZone.tsx       Drag-and-drop PDF upload UI
            ProcessingStatus.tsx Live step-by-step progress tracker
            ReviewDisplay.tsx    Full review result display
            SectionCard.tsx      Expandable per-section feedback card
            ScoreRing.tsx        Animated circular score indicator
```

---

## API Reference

### POST /api/review

Upload a PDF and receive a streaming review.

- Body: multipart/form-data with field "file" (PDF only, max 20 MB)
- Response: text/event-stream (SSE)

```
data: {"type": "progress", "step": "parsing",           "detail": "..."}
data: {"type": "progress", "step": "embedding",         "detail": "..."}
data: {"type": "progress", "step": "searching",         "detail": "..."}
data: {"type": "progress", "step": "reviewing_section", "detail": "..."}
data: {"type": "progress", "step": "overall",           "detail": "..."}
data: {"type": "result",   "data": { ...ReviewResult... }}
data: [DONE]
```

### GET /api/health

```json
{ "status": "ok", "openai_configured": false, "tavily_configured": true }
```
