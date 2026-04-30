"""
The Professor – Intelligent Pre-Submission Paper Review System
FastAPI backend
"""
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from dotenv import load_dotenv

load_dotenv()

from services.review_generator import generate_review_stream


@asynccontextmanager
async def lifespan(app: FastAPI):
    if not os.getenv("GROQ_API_KEY") and not os.getenv("OPENAI_API_KEY"):
        print("WARNING: No LLM API key set. Set GROQ_API_KEY (free) or OPENAI_API_KEY in .env")
    elif os.getenv("GROQ_API_KEY"):
        print("INFO: Using Groq LLM backend")
    else:
        print("INFO: Using OpenAI LLM backend")
    yield


app = FastAPI(
    title="The Professor API",
    description="Intelligent Pre-Submission Paper Review System using RAG",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
async def health():
    return {
        "status": "ok",
        "openai_configured": bool(os.getenv("OPENAI_API_KEY")),
        "tavily_configured": bool(os.getenv("TAVILY_API_KEY")),
    }


@app.post("/api/review")
async def review_paper(file: UploadFile = File(...)):
    """
    Upload a research paper PDF and receive a streaming review.
    Returns Server-Sent Events with progress updates and final review.
    """
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are supported.")

    content = await file.read()
    if len(content) > 20 * 1024 * 1024:  # 20 MB limit
        raise HTTPException(status_code=400, detail="File too large. Maximum size is 20 MB.")

    if not os.getenv("GROQ_API_KEY") and not os.getenv("OPENAI_API_KEY"):
        raise HTTPException(status_code=503, detail="No LLM API key configured. Set GROQ_API_KEY (free at console.groq.com) or OPENAI_API_KEY in backend/.env")

    async def event_stream():
        async for chunk in generate_review_stream(content):
            yield chunk

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )
