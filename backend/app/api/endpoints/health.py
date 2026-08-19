import redis
from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core import deps
from app.core.config import settings

router = APIRouter()


@router.get("")
@router.get("/")
def health_check(db: Session = Depends(deps.get_db)):
    database_status = "healthy"
    redis_status = "healthy"
    details = {}
    try:
        db.execute(text("SELECT 1"))
    except Exception as exc:
        database_status = "unhealthy"
        details["database_error"] = str(exc)
    try:
        client = redis.Redis.from_url(settings.REDIS_URL, socket_timeout=2.0)
        client.ping()
    except Exception as exc:
        redis_status = "unhealthy"
        details["redis_error"] = str(exc)

    overall = "healthy" if database_status == "healthy" and redis_status == "healthy" else "degraded"
    response = {"status": overall, "database": database_status, "redis": redis_status}
    if details:
        response["details"] = details
    return response
