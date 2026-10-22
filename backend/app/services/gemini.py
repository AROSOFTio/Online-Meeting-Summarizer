import json
from typing import Any

from google.genai import types

from app.core.config import settings
from app.services.gemini_client import get_gemini_client, resolve_gemini_model, generate_with_retry


class GeminiService:
    @property
    def enabled(self) -> bool:
        return bool(settings.GEMINI_API_KEY)

    def summarize_transcript(self, transcript: str) -> dict[str, Any]:
        if not self.enabled:
            raise RuntimeError("GEMINI_API_KEY is not configured")
        if not transcript.strip():
            raise RuntimeError("Cannot summarize an empty transcript")

        prompt = (
            "Act as a professional minute secretary for Starlight Secondary School. Prepare formal, "
            "publication-ready meeting minutes using only facts stated in the transcript. Write in "
            "clear past tense and keep discussions, resolutions and conclusions in logical order. "
            "Never invent names, dates, attendance, decisions or deadlines. ALWAYS return a non-empty "
            "agenda. Infer concise agenda items from the topics actually discussed even when nobody "
            "explicitly announces an agenda. Topic changes may indicate new agenda items. If the meeting "
            "contains only one broad topic, return one agenda item describing that topic. Return a polished "
            "summary, up to 10 key points, explicit decisions, and action items. Each action item must include "
            "description, assignee (empty when unknown), priority (low, medium or high), and due_date "
            "(ISO date or empty).\n\nTRANSCRIPT:\n" + transcript
        )
        schema = {
            "type": "object",
            "properties": {
                "agenda": {"type": "array", "minItems": 1, "items": {"type": "string"}},
                "summary": {"type": "string"},
                "key_points": {"type": "array", "items": {"type": "string"}},
                "decisions": {"type": "array", "items": {"type": "string"}},
                "action_items": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "description": {"type": "string"},
                            "assignee": {"type": "string"},
                            "priority": {"type": "string", "enum": ["low", "medium", "high"]},
                            "due_date": {"type": "string"},
                        },
                        "required": ["description", "assignee", "priority", "due_date"],
                        "additionalProperties": False,
                    },
                },
            },
            "required": ["agenda", "summary", "key_points", "decisions", "action_items"],
            "additionalProperties": False,
        }
        response = generate_with_retry(
            model=resolve_gemini_model(),
            contents=prompt,
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                response_json_schema=schema,
                temperature=0.2,
            ),
        )
        result = json.loads((response.text or "").strip())
        if not result.get("summary"):
            raise RuntimeError("Gemini returned an empty summary")
        if not result.get("agenda"):
            raise RuntimeError("Gemini returned an empty agenda")
        return result


gemini_service = GeminiService()
