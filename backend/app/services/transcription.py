import os
from pathlib import Path
from typing import List, Dict, Any
from app.core.config import settings

class TranscriptionService:
    def __init__(self):
        self.model_size = settings.WHISPER_MODEL
        self._model = None

    def get_model(self):
        """Lazy load the Whisper model to keep startup fast."""
        if self._model is None:
            # Check for developer mock override
            if os.getenv("MOCK_WHISPER", "false").lower() == "true":
                return None
                
            from faster_whisper import WhisperModel
            model_cache = Path(settings.STORAGE_DIR) / "models"
            model_cache.mkdir(parents=True, exist_ok=True)
            # Load model onto CPU with int8 quantization (lightweight and platform-agnostic)
            self._model = WhisperModel(
                self.model_size,
                device="cpu",
                compute_type="int8",
                download_root=str(model_cache),
            )
        return self._model

    def transcribe(self, audio_path: str) -> List[Dict[str, Any]]:
        """
        Transcribes a normalised WAV audio file.
        Returns:
            List of segments: [{"start": float, "end": float, "text": str, "speaker": str}]
        """
        if os.getenv("MOCK_WHISPER", "false").lower() == "true":
            print("[INFO] MOCK_WHISPER=true: Returning simulated transcript segments.")
            return [
                {"start": 0.0, "end": 2.5, "text": "Welcome to the Starlight Secondary School board meeting.", "speaker": "Speaker 1"},
                {"start": 2.5, "end": 5.0, "text": "We will discuss Amuria District academic performance.", "speaker": "Speaker 2"}
            ]

        try:
            model = self.get_model()
            if model is None:
                # Fallback if imports failed
                raise RuntimeError("Faster-Whisper model could not be initialised.")

            segments, info = model.transcribe(
                audio_path,
                beam_size=1,
                best_of=1,
                vad_filter=True,
                vad_parameters={"min_silence_duration_ms": 500},
                condition_on_previous_text=False,
                word_timestamps=False,
            )
            
            output_segments = []
            for segment in segments:
                output_segments.append({
                    "start": round(segment.start, 2),
                    "end": round(segment.end, 2),
                    "text": segment.text.strip(),
                    # Faster-Whisper performs ASR, not speaker diarization.
                    "speaker": "Speaker 1",
                })
            
            # If no segments detected (silent file), return empty list rather than crashing
            return output_segments

        except Exception as e:
            print(f"[ERROR] Faster-Whisper transcription failed: {e}")
            raise RuntimeError(f"Transcription failed: {str(e)}")

transcription_service = TranscriptionService()
