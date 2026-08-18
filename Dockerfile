FROM python:3.12-slim

# Install system dependencies, including FFmpeg for Gemini audio processing
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    build-essential \
    libpq-dev \
    gcc \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /workspace

# Copy dependencies list and install them from backend
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy full application codebase
COPY backend /workspace/backend
WORKDIR /workspace/backend

EXPOSE 8000

# Run FastAPI backend app with safe database schema creation
CMD ["sh", "-c", "alembic upgrade head || true; exec uvicorn app.main:app --host 0.0.0.0 --port 8000"]

