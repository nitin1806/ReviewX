"""
PDF parsing service: extracts text and identifies paper sections.
"""
import re
from typing import Dict, List, Optional, Tuple
import fitz  # PyMuPDF


SECTION_PATTERNS = [
    (r"abstract", "Abstract"),
    (r"(?:1\.?\s*)?introduction", "Introduction"),
    (r"(?:related\s+work|background|literature\s+review)", "Related Work"),
    (r"(?:\d+\.?\s*)?(?:methodology|method|approach|proposed|system\s+design|framework)", "Methodology"),
    (r"(?:\d+\.?\s*)?(?:experiment|evaluation|results?|performance)", "Results"),
    (r"(?:\d+\.?\s*)?discussion", "Discussion"),
    (r"(?:\d+\.?\s*)?(?:conclusion|summary|future\s+work)", "Conclusion"),
    (r"references?|bibliography", "References"),
]


def extract_text_from_pdf(file_bytes: bytes) -> str:
    doc = fitz.open(stream=file_bytes, filetype="pdf")
    full_text = []
    for page in doc:
        full_text.append(page.get_text())
    doc.close()
    return "\n".join(full_text)


def extract_metadata(text: str) -> Dict[str, str]:
    """Extract title and abstract from the beginning of the paper."""
    lines = [l.strip() for l in text.split("\n") if l.strip()]

    title = ""
    for i, line in enumerate(lines[:15]):
        if len(line) > 10 and not re.match(r"^\d+$", line):
            if not any(kw in line.lower() for kw in ["abstract", "introduction", "vol.", "doi:", "arxiv", "@", "university", "department", "conference", "workshop", "journal"]):
                title = line
                break

    abstract_match = re.search(
        r"abstract[:\s\-]*(.+?)(?=\n\s*(?:\d+\.?\s*introduction|keywords?|index\s+terms))",
        text,
        re.IGNORECASE | re.DOTALL,
    )
    abstract = abstract_match.group(1).strip() if abstract_match else ""

    keywords_match = re.search(
        r"(?:keywords?|index\s+terms)[:\s\-]*(.+?)(?=\n\s*\d+\.?\s*\w|\n\n)",
        text,
        re.IGNORECASE | re.DOTALL,
    )
    keywords = keywords_match.group(1).strip() if keywords_match else ""

    return {"title": title, "abstract": abstract, "keywords": keywords}


def segment_sections(text: str) -> Dict[str, str]:
    """
    Segment the paper into named sections.
    Returns a dict mapping section name -> section text.
    """
    # Find all section headings with their positions
    heading_positions: List[Tuple[int, str]] = []

    for pattern, section_name in SECTION_PATTERNS:
        for match in re.finditer(
            r"(?:^|\n)[\s\d\.]*(" + pattern + r")[^\n]{0,60}\n",
            text,
            re.IGNORECASE,
        ):
            heading_positions.append((match.start(), section_name))

    if not heading_positions:
        return {"Full Paper": text}

    # Sort by position and deduplicate
    heading_positions.sort(key=lambda x: x[0])
    seen = set()
    unique_positions = []
    for pos, name in heading_positions:
        if name not in seen:
            seen.add(name)
            unique_positions.append((pos, name))

    sections: Dict[str, str] = {}
    for i, (start, name) in enumerate(unique_positions):
        end = unique_positions[i + 1][0] if i + 1 < len(unique_positions) else len(text)
        sections[name] = text[start:end].strip()

    # Capture anything before first section as preamble (title/authors)
    if unique_positions and unique_positions[0][0] > 0:
        sections["Preamble"] = text[: unique_positions[0][0]].strip()

    return sections


def parse_paper(file_bytes: bytes) -> Dict:
    """
    Full pipeline: PDF bytes → structured paper dict.
    Returns: {title, abstract, keywords, sections, full_text, word_count}
    """
    full_text = extract_text_from_pdf(file_bytes)
    metadata = extract_metadata(full_text)
    sections = segment_sections(full_text)

    word_count = len(full_text.split())

    return {
        "title": metadata["title"],
        "abstract": metadata["abstract"],
        "keywords": metadata["keywords"],
        "sections": sections,
        "full_text": full_text,
        "word_count": word_count,
        "detected_sections": list(sections.keys()),
    }


def get_paper_chunks(sections: Dict[str, str], chunk_size: int = 800, overlap: int = 100) -> List[Dict]:
    """Split sections into overlapping chunks for embedding."""
    chunks = []
    for section_name, content in sections.items():
        words = content.split()
        for i in range(0, len(words), chunk_size - overlap):
            chunk_text = " ".join(words[i : i + chunk_size])
            if len(chunk_text.strip()) > 50:
                chunks.append(
                    {
                        "section": section_name,
                        "text": chunk_text,
                        "chunk_idx": len(chunks),
                    }
                )
    return chunks
