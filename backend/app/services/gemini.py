import json
from typing import Any, Optional

from google.genai import types

from app.core.config import settings
from app.services.gemini_client import get_gemini_client, resolve_gemini_model


class GeminiService:
    @property
    def enabled(self) -> bool:
        return bool(settings.GEMINI_API_KEY)

    def summarize_transcript(self, transcript: str, organization: Optional[dict[str, str]] = None) -> dict[str, Any]:
        if not self.enabled:
            raise RuntimeError("GEMINI_API_KEY is not configured")
        if not transcript.strip():
            raise RuntimeError("Cannot summarize an empty transcript")

        org = organization or {}
        org_name = org.get("organization_name") or "the organization"
        org_type = org.get("organization_type") or "General organization"
        minutes_title = org.get("minutes_document_title") or "Meeting Minutes"
        minutes_style = org.get("minutes_style") or "Standard Professional"
        minutes_language = org.get("minutes_language") or "English"
        agenda_label = org.get("agenda_label") or "Agenda"
        proceedings_label = org.get("proceedings_label") or "Minutes / Proceedings"
        decisions_label = org.get("decisions_label") or "Decisions"
        action_items_label = org.get("action_items_label") or "Action Items"

        prompt = (
            f"Act as a professional minute secretary for {org_name}, an organization categorized as {org_type}. "
            f"Prepare publication-ready {minutes_title} in {minutes_language}, using a {minutes_style} style. "
            "Use only facts stated in the transcript. Write clearly in past tense and preserve the logical order "
            "of discussions, resolutions and conclusions. Never invent names, dates, attendance, decisions, "
            "deadlines or responsibilities. ALWAYS return a non-empty agenda. Infer concise agenda items from "
            "topics actually discussed even when nobody explicitly announces an agenda. Topic changes may indicate "
            "new agenda items. If the meeting contains only one broad topic, return one agenda item describing it. "
            f"The organization's preferred document labels are: {agenda_label}; {proceedings_label}; "
            f"{decisions_label}; {action_items_label}. Reflect those conventions in wording where appropriate. "
            "Return a polished summary, up to 10 key points, explicit decisions, and action items. Each action item "
            "must include description, assignee (empty when unknown), priority (low, medium or high), and due_date "
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
        response = get_gemini_client().models.generate_content(
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
