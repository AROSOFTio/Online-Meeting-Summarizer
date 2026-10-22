from functools import lru_cache

from google import genai

from app.core.config import settings


DEFAULT_GEMINI_MODEL = "gemini-3.6-flash"
_RETIRED_MODELS = {
    "gemini-1.5-flash",
    "gemini-1.5-flash-latest",
    "gemini-1.5-pro",
    "gemini-1.5-pro-latest",
    "gemini-2.0-flash",
    "gemini-2.0-flash-001",
    "gemini-2.0-flash-lite",
    "gemini-2.0-flash-lite-001",
    "gemini-pro",
}


def resolve_gemini_model() -> str:
    configured = (settings.GEMINI_MODEL or "").strip()
    if not configured or configured in _RETIRED_MODELS:
        return DEFAULT_GEMINI_MODEL
    return configured


@lru_cache(maxsize=1)
def get_gemini_client() -> genai.Client:
    if not settings.GEMINI_API_KEY:
        raise RuntimeError(
            "GEMINI_API_KEY is not configured. Add a valid Google Gemini API key in Coolify."
        )
    return genai.Client(api_key=settings.GEMINI_API_KEY)


def generate_with_retry(**kwargs):
    """Retry only temporary Gemini overload/rate-limit failures."""
    import random
    import time
    for attempt in range(5):
        try:
            return get_gemini_client().models.generate_content(**kwargs)
        except Exception as exc:
            message = str(exc).upper()
            transient = any(token in message for token in ("503", "UNAVAILABLE", "429", "RESOURCE_EXHAUSTED", "500 INTERNAL", "DEADLINE_EXCEEDED", "504"))
            if not transient or attempt == 4:
                raise
            delay = min(35, 2 ** (attempt + 1) + random.uniform(0, 1.5))
            print(f"[WARNING] Gemini temporary overload, retry {attempt + 1}/4 in {delay:.1f}s", flush=True)
            time.sleep(delay)
