FROM python:3.12-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    postgresql-client \
    build-essential \
    libpq-dev \
    gcc \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /workspace
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY backend /workspace/backend
WORKDIR /workspace/backend

EXPOSE 8000
CMD ["sh", "-c", "alembic upgrade head || true; exec uvicorn app.main:app --host 0.0.0.0 --port 8000"]
