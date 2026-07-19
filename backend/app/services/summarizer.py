import re
from typing import List, Dict, Any, Optional


# ------------------------------------------------------------------
# Sentence tokenizer (no NLTK required)
# ------------------------------------------------------------------

def _split_sentences(text: str) -> List[str]:
    """Split text into sentences using punctuation boundaries."""
    parts = re.split(r"(?<=[.!?])\s+", text.strip())
    return [p.strip() for p in parts if len(p.strip()) > 10]


# ------------------------------------------------------------------
# TextRank summarization
# ------------------------------------------------------------------

def summarize(text: str, sentence_count: int = 5) -> str:
    """
    Extractive TextRank summarization.
    Returns the top `sentence_count` most representative sentences,
    in their original order from the source text.
    Never generates content not present in the input.
    """
    if not text or not text.strip():
        return ""

    sentences = _split_sentences(text)
    if len(sentences) <= sentence_count:
        return text.strip()

    try:
        import networkx as nx
        from sklearn.feature_extraction.text import TfidfVectorizer
        from sklearn.metrics.pairwise import cosine_similarity
        import numpy as np

        # Build TF-IDF matrix
        vectorizer = TfidfVectorizer(stop_words="english")
        tfidf = vectorizer.fit_transform(sentences)

        # Build similarity matrix
        sim_matrix = cosine_similarity(tfidf, tfidf)
        np.fill_diagonal(sim_matrix, 0)

        # Build graph and run PageRank
        graph = nx.from_numpy_array(sim_matrix)
        scores = nx.pagerank(graph, max_iter=200)

        # Rank and select top sentences, then restore original order
        ranked = sorted(scores.items(), key=lambda x: x[1], reverse=True)
        top_indices = sorted([idx for idx, _ in ranked[:sentence_count]])
        return " ".join(sentences[i] for i in top_indices)

    except ImportError:
        # Fallback: simple frequency-based extraction
        words = re.findall(r"\b\w+\b", text.lower())
        freq: Dict[str, int] = {}
        stopwords = {"the", "a", "an", "and", "or", "but", "in", "on", "at",
                     "to", "of", "is", "was", "are", "were", "it", "that",
                     "this", "with", "for", "as", "by", "from", "be", "been"}
        for w in words:
            if w not in stopwords:
                freq[w] = freq.get(w, 0) + 1

        def score(sentence: str) -> float:
            ws = re.findall(r"\b\w+\b", sentence.lower())
            return sum(freq.get(w, 0) for w in ws) / max(len(ws), 1)

        scored = sorted(enumerate(sentences), key=lambda x: score(x[1]), reverse=True)
        top_indices = sorted([idx for idx, _ in scored[:sentence_count]])
        return " ".join(sentences[i] for i in top_indices)


# ------------------------------------------------------------------
# Decision extraction
# ------------------------------------------------------------------

DECISION_PATTERNS = re.compile(
    r"\b(resolved|agreed|decided|approved|voted|accepted|rejected|confirmed|"
    r"endorsed|concluded|authorized|mandated|recommended|ruled)\b",
    re.IGNORECASE,
)


def extract_decisions(text: str) -> List[str]:
    """
    Extract sentences that contain decision language.
    Returns only sentences that match known decision vocabulary —
    never fabricates content.
    """
    sentences = _split_sentences(text)
    return [s for s in sentences if DECISION_PATTERNS.search(s)]


# ------------------------------------------------------------------
# Action item extraction
# ------------------------------------------------------------------

ACTION_PATTERNS = re.compile(
    r"\b(will|shall|must|should|needs? to|is to|are to|has to|have to|"
    r"is required to|are required to|to be|ought to|tasked with)\b",
    re.IGNORECASE,
)

# Deadline patterns — looks for "by <date>" or "before <date>"
DEADLINE_PATTERN = re.compile(
    r"\b(by|before|no later than|not later than|due|deadline[: ]+)\s+"
    r"(?P<deadline>[A-Za-z0-9 ,]+?)(?=[.,;]|$)",
    re.IGNORECASE,
)


def extract_action_items(text: str) -> List[Dict[str, Any]]:
    """
    Extract candidate action items from transcript text.
    Each item carries: text, raw_assignee hint, raw_deadline hint.
    Returns only sentences from the actual input text — no fabrication.
    """
    sentences = _split_sentences(text)
    items: List[Dict[str, Any]] = []

    for sentence in sentences:
        if ACTION_PATTERNS.search(sentence):
            deadline_match = DEADLINE_PATTERN.search(sentence)
            raw_deadline: Optional[str] = None
            if deadline_match:
                raw_deadline = deadline_match.group("deadline").strip()

            items.append({
                "text": sentence,
                "raw_assignee": None,  # Phase 4 speaker diarization will populate this
                "raw_deadline": raw_deadline,
            })

    return items


# ------------------------------------------------------------------
# Key points extraction (top N sentences, different from summary)
# ------------------------------------------------------------------

def extract_key_points(text: str, count: int = 5) -> List[str]:
    """Return the top N highest-value sentences as key bullet points."""
    summary = summarize(text, sentence_count=count)
    if not summary:
        return []
    return _split_sentences(summary)
