import os
import base64
import httpx
from typing import Optional
from app.core.config import settings

class GoogleTTSService:
    """
    Google Text-to-Speech service using Google TTS REST API or fallback browser audio synthesize.
    Synthesizes clear speech audio for meeting minutes and summaries.
    """
    def __init__(self):
        self.api_key = settings.GEMINI_API_KEY  # Can use Google Cloud API Key or Gemini Key for Google Cloud services

    def text_to_speech(self, text: str, voice_name: str = "en-US-Neural2-F") -> Optional[bytes]:
        """
        Converts input text to MP3 audio bytes using Google Cloud TTS.
        """
        if not text or not text.strip():
            return None

        if not self.api_key:
            print("[WARNING] Google API key not configured for TTS. Audio generation skipped.")
            return None

        url = f"https://texttospeech.googleapis.com/v1/text:synthesize?key={self.api_key}"
        payload = {
            "input": {"text": text[:5000]}, # Cap single TTS chunk at 5000 chars
            "voice": {
                "languageCode": "en-US",
                "name": voice_name
            },
            "audioConfig": {
                "audioEncoding": "MP3"
            }
        }

        try:
            with httpx.Client(timeout=30) as client:
                res = client.post(url, json=payload)
                res.raise_for_status()
                data = res.json()
                audio_content = data.get("audioContent")
                if audio_content:
                    return base64.b64decode(audio_content)
        except Exception as e:
            print(f"[ERROR] Google TTS synthesis failed: {e}")
            return None
        return None

tts_service = GoogleTTSService()
