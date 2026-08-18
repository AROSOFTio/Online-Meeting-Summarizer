import re
from typing import List, Dict, Any, Optional
from app.services.gemini import gemini_service

def _split_sentences(text: str) -> List[str]:
    """Split text into sentences using punctuation boundaries."""
    parts = re.split(r"(?<=[.!?])\s+", text.strip())
    return [p.strip() for p in parts if len(p.strip()) > 10]

def summarize(text: str, sentence_count: int = 5) -> str:
    """
    Summarize transcript using Gemini AI.
    """
    if not text or not text.strip():
        return ""
    try:
        if gemini_service.enabled:
            result = gemini_service.summarize_transcript(text)
            return result.get("summary", "")
    except Exception as e:
        print(f"[WARNING] Gemini summarization error: {e}")

    sentences = _split_sentences(text)
    return " ".join(sentences[:sentence_count])

def extract_decisions(text: str) -> List[str]:
    """
    Extract decisions using Gemini AI.
    """
    if not text or not text.strip():
        return []
    try:
        if gemini_service.enabled:
            result = gemini_service.summarize_transcript(text)
            return result.get("decisions", [])
    except Exception as e:
        print(f"[WARNING] Gemini decision extraction error: {e}")

    DECISION_PATTERNS = re.compile(
        r"\b(resolved|agreed|decided|approved|voted|accepted|rejected|confirmed|"
        r"endorsed|concluded|authorized|mandated|recommended|ruled)\b",
        re.IGNORECASE,
    )
    sentences = _split_sentences(text)
    return [s for s in sentences if DECISION_PATTERNS.search(s)]

def extract_action_items(text: str) -> List[Dict[str, Any]]:
    """
    Extract action items using Gemini AI.
    """
    if not text or not text.strip():
        return []
    try:
        if gemini_service.enabled:
            result = gemini_service.summarize_transcript(text)
            items = []
            for item in result.get("action_items", []):
                items.append({
                    "text": item.get("description", ""),
                    "raw_assignee": item.get("assignee"),
                    "raw_deadline": item.get("due_date"),
                    "priority": item.get("priority", "medium")
                })
            return items
    except Exception as e:
        print(f"[WARNING] Gemini action items error: {e}")

    ACTION_PATTERNS = re.compile(
        r"\b(will|shall|must|should|needs? to|is to|are to|has to|have to|"
        r"is required to|are required to|to be|ought to|tasked with)\b",
        re.IGNORECASE,
    )
    sentences = _split_sentences(text)
    items: List[Dict[str, Any]] = []
    for sentence in sentences:
        if ACTION_PATTERNS.search(sentence):
            items.append({
                "text": sentence,
                "raw_assignee": None,
                "raw_deadline": None,
                "priority": "medium"
            })
    return items

def extract_key_points(text: str, count: int = 5) -> List[str]:
    """
    Extract key points using Gemini AI.
    """
    if not text or not text.strip():
        return []
    try:
        if gemini_service.enabled:
            result = gemini_service.summarize_transcript(text)
            return result.get("key_points", [])[:count]
    except Exception as e:
        print(f"[WARNING] Gemini key points error: {e}")

    sentences = _split_sentences(text)
    return sentences[:count]

