import json
import os
import time
from typing import Any, Dict, List, Optional

from google.genai import types

from app.core.config import settings
from app.services.gemini_client import get_gemini_client, resolve_gemini_model, generate_with_retry


class TranscriptionService:
    """Gemini audio transcription with timestamps and attendance-aware speakers."""

    @property
    def enabled(self) -> bool:
        return bool(settings.GEMINI_API_KEY)

    def _wait_until_ready(self, file_obj: Any, timeout_seconds: int = 120) -> Any:
        client = get_gemini_client()
        deadline = time.monotonic() + timeout_seconds
        current = file_obj
        while time.monotonic() < deadline:
            state = getattr(current, "state", None)
            state_name = str(getattr(state, "name", state) or "ACTIVE").upper()
            if state_name in {"ACTIVE", "STATE_UNSPECIFIED", "NONE"}:
                return current
            if state_name == "FAILED":
                raise RuntimeError("Gemini Files API could not process the uploaded audio file")
            time.sleep(1.5)
            current = client.files.get(name=current.name)
        raise RuntimeError("Timed out while Gemini prepared the uploaded audio file")

    @staticmethod
    def _parse_json(text: str) -> Any:
        cleaned = (text or "").strip()
        if cleaned.startswith("```"):
            cleaned = cleaned.removeprefix("```json").removeprefix("```")
            cleaned = cleaned.removesuffix("```").strip()
        return json.loads(cleaned)

    def transcribe(self, audio_path: str, participant_names: Optional[List[str]] = None) -> List[Dict[str, Any]]:
        if os.getenv("MOCK_TRANSCRIPTION", "false").lower() == "true":
            spk1 = participant_names[0] if participant_names else "Speaker 1"
            spk2 = participant_names[1] if participant_names and len(participant_names) > 1 else spk1
            return [
                {"start": 0.0, "end": 4.5, "text": "Welcome everyone to the Starlight Secondary School meeting.", "speaker": spk1},
                {"start": 4.5, "end": 10.0, "text": "We are reviewing today's agenda and action items.", "speaker": spk2},
            ]

        if not os.path.isfile(audio_path):
            raise FileNotFoundError(f"Audio file not found: {audio_path}")
        if not self.enabled:
            raise RuntimeError(
                "GEMINI_API_KEY is not configured. Audio was uploaded successfully, "
                "but AI transcription cannot start until a valid Gemini API key is configured."
            )

        attendees = ", ".join(participant_names or []) or "No confirmed attendee names supplied"
        prompt = (
            "Transcribe this school meeting audio faithfully. Preserve the words actually spoken; "
            "do not invent missing speech. Handle Ugandan/African, British, Indian, American and "
            "other English accents. Return chronological speaker turns with start and end times in "
            "seconds. Use an attendee name only when the audio or context supports that identity; "
            "otherwise use Speaker 1, Speaker 2, etc. "
            f"Known attendees: {attendees}."
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

        client = get_gemini_client()
        uploaded = None
        model = resolve_gemini_model()
        try:
            uploaded = client.files.upload(file=audio_path)
            uploaded = self._wait_until_ready(uploaded)
            response = generate_with_retry(
                model=model,
                contents=[prompt, uploaded],
                config=types.GenerateContentConfig(
                    response_mime_type="application/json",
                    response_json_schema=schema,
                    temperature=0.1,
                ),
            )
            segments = self._parse_json(response.text or "[]")
            if not isinstance(segments, list) or not segments:
                raise RuntimeError("Gemini returned an empty transcript")

            output: List[Dict[str, Any]] = []
            for index, segment in enumerate(segments, 1):
                text = str(segment.get("text", "")).strip()
                if not text:
                    continue
                start = max(0.0, float(segment.get("start", 0.0) or 0.0))
                end = max(start, float(segment.get("end", start) or start))
                speaker = str(segment.get("speaker") or f"Speaker {index}").strip()
                output.append({"start": start, "end": end, "text": text, "speaker": speaker})
            if not output:
                raise RuntimeError("Gemini returned transcript segments without speech text")
            return output
        except Exception as exc:
            message = str(exc)
            if "404" in message or "NOT_FOUND" in message.upper():
                raise RuntimeError(
                    f"Gemini model '{model}' is unavailable. Redeploy and remove any stale GEMINI_MODEL override in Coolify."
                ) from exc
            raise RuntimeError(f"Gemini audio transcription failed: {message}") from exc
        finally:
            if uploaded is not None and getattr(uploaded, "name", None):
                try:
                    client.files.delete(name=uploaded.name)
                except Exception as cleanup_error:
                    print(f"[WARNING] Could not delete temporary Gemini upload: {cleanup_error}")


transcription_service = TranscriptionService()
