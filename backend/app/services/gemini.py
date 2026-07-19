import json
from typing import Any

import httpx

from app.core.config import settings


class GeminiService:
    endpoint = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"

    @property
    def enabled(self) -> bool:
        return bool(settings.GEMINI_API_KEY)

    def summarize_transcript(self, transcript: str) -> dict[str, Any]:
        if not self.enabled:
            raise RuntimeError("GEMINI_API_KEY is not configured")

        prompt = (
            "Act as a professional minute secretary. Prepare formal, publication-ready meeting "
            "minutes using only facts stated in the transcript. Write the summary in clear, "
            "grammatically correct past tense, recording the main agenda discussions, resolutions "
            "and conclusions in logical order. Do not invent names, dates, attendance or decisions. "
            "Return a polished summary, up to 10 key points, explicit decisions, "
            "and action items. Each action item must contain description, assignee (empty "
            "string when unknown), priority (low, medium, or high), and due_date (ISO date "
            "or empty string). Transcript:\n\n"
            f"{transcript}"
        )
        schema = {
            "type": "OBJECT",
            "properties": {
                "summary": {"type": "STRING"},
                "key_points": {"type": "ARRAY", "items": {"type": "STRING"}},
                "decisions": {"type": "ARRAY", "items": {"type": "STRING"}},
                "action_items": {
                    "type": "ARRAY",
                    "items": {
                        "type": "OBJECT",
                        "properties": {
                            "description": {"type": "STRING"},
                            "assignee": {"type": "STRING"},
                            "priority": {
                                "type": "STRING",
                                "enum": ["low", "medium", "high"],
                            },
                            "due_date": {"type": "STRING"},
                        },
                        "required": ["description", "assignee", "priority", "due_date"],
                    },
                },
            },
            "required": ["summary", "key_points", "decisions", "action_items"],
        }
        payload = {
            "contents": [{"role": "user", "parts": [{"text": prompt}]}],
            "generationConfig": {
                "responseMimeType": "application/json",
                "responseSchema": schema,
                "temperature": 0.2,
            },
        }
        url = self.endpoint.format(model=settings.GEMINI_MODEL)
        with httpx.Client(timeout=90) as client:
            response = client.post(
                url,
                headers={
                    "x-goog-api-key": settings.GEMINI_API_KEY or "",
                    "Content-Type": "application/json",
                },
                json=payload,
            )
            response.raise_for_status()

        data = response.json()
        candidates = data.get("candidates") or []
        if not candidates:
            raise RuntimeError("Gemini returned no summary candidate")
        parts = candidates[0].get("content", {}).get("parts", [])
        text = "".join(part.get("text", "") for part in parts)
        result = json.loads(text)
        if not result.get("summary"):
            raise RuntimeError("Gemini returned an empty summary")
        return result


gemini_service = GeminiService()
