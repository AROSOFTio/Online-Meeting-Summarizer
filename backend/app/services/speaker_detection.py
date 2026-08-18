from typing import List, Dict, Any, Optional
import httpx
import json
from app.core.config import settings

class SpeakerDetectionService:
    """
    Detects and attributes speaker names based on participant attendance rosters.
    """
    def __init__(self):
        self.endpoint = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"

    def match_speakers_to_attendance(
        self, 
        transcript_segments: List[Dict[str, Any]], 
        attendance_roster: List[str]
    ) -> List[Dict[str, Any]]:
        """
        Takes raw transcript segments and attendance roster, using Gemini to refine speaker turn assignments.
        """
        if not attendance_roster or not transcript_segments:
            return transcript_segments

        if not settings.GEMINI_API_KEY:
            # Fallback assignment if no key
            for seg in transcript_segments:
                if not seg.get("speaker") or seg.get("speaker") in ["Speaker 1", "Unknown"]:
                    seg["speaker"] = attendance_roster[0] if attendance_roster else "Speaker 1"
            return transcript_segments

        prompt = (
            f"You are a meeting assistant. Here is a list of confirmed meeting attendees: {attendance_roster}.\n"
            "Below is a set of transcribed speech segments. Match each speaker label to one of the attendee names "
            "based on vocal self-introductions, direct addressing, or contextual turn-taking.\n\n"
            f"Segments:\n{json.dumps(transcript_segments, indent=2)}\n\n"
            "Return JSON matching the schema: array of segments with start, end, text, speaker (mapped name)."
        )

        schema = {
            "type": "ARRAY",
            "items": {
                "type": "OBJECT",
                "properties": {
                    "start": {"type": "NUMBER"},
                    "end": {"type": "NUMBER"},
                    "text": {"type": "STRING"},
                    "speaker": {"type": "STRING"}
                },
                "required": ["start", "end", "text", "speaker"]
            }
        }

        payload = {
            "contents": [{"role": "user", "parts": [{"text": prompt}]}],
            "generationConfig": {
                "responseMimeType": "application/json",
                "responseSchema": schema,
                "temperature": 0.1
            }
        }

        try:
            url = self.endpoint.format(model=settings.GEMINI_MODEL)
            with httpx.Client(timeout=60) as client:
                response = client.post(
                    url,
                    headers={
                        "x-goog-api-key": settings.GEMINI_API_KEY,
                        "Content-Type": "application/json"
                    },
                    json=payload
                )
                response.raise_for_status()

            data = response.json()
            parts = data["candidates"][0]["content"]["parts"]
            raw_text = "".join(part.get("text", "") for part in parts)
            refined_segments = json.loads(raw_text)
            return refined_segments
        except Exception as e:
            print(f"[WARNING] Speaker detection refinement error: {e}")
            return transcript_segments

speaker_detection_service = SpeakerDetectionService()
