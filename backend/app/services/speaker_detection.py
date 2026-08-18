import json
from typing import Any, Dict, List

from google.genai import types

from app.core.config import settings
from app.services.gemini_client import get_gemini_client, resolve_gemini_model


class SpeakerDetectionService:
    """Conservative attendee-name refinement for transcript speaker labels."""

    def match_speakers_to_attendance(
        self,
        transcript_segments: List[Dict[str, Any]],
        attendance_roster: List[str],
    ) -> List[Dict[str, Any]]:
        if not attendance_roster or not transcript_segments or not settings.GEMINI_API_KEY:
            return transcript_segments

        prompt = (
            "Map speaker labels to confirmed attendee names only where the segment text supports the "
            "identity through a self-introduction, direct address, or strong contextual evidence. "
            "Do not guess. Keep an existing generic Speaker N label when uncertain.\n"
            f"Confirmed attendees: {attendance_roster}\n"
            f"Segments: {json.dumps(transcript_segments, ensure_ascii=False)}"
        )
        schema = {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "start": {"type": "number"},
                    "end": {"type": "number"},
                    "text": {"type": "string"},
                    "speaker": {"type": "string"},
                },
                "required": ["start", "end", "text", "speaker"],
                "additionalProperties": False,
            },
        }
        try:
            response = get_gemini_client().models.generate_content(
                model=resolve_gemini_model(),
                contents=prompt,
                config=types.GenerateContentConfig(
                    response_mime_type="application/json",
                    response_json_schema=schema,
                    temperature=0.0,
                ),
            )
            result = json.loads(response.text or "[]")
            return result if isinstance(result, list) and result else transcript_segments
        except Exception as exc:
            print(f"[WARNING] Speaker-name refinement skipped: {exc}")
            return transcript_segments


speaker_detection_service = SpeakerDetectionService()
