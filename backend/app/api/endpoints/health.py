from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import text
import redis
from app.core import deps
from app.core.config import settings

router = APIRouter()

@router.get("")
@router.get("/")
def health_check(db: Session = Depends(deps.get_db)):
    """Health check endpoint to verify database and Redis state"""
    postgres_status = "healthy"
    redis_status = "healthy"
    details = {}
    
    # Check Database connection
    try:
        db.execute(text("SELECT 1"))
    except Exception as e:
        postgres_status = "unhealthy"
        details["database_error"] = str(e)
        
    # Check Redis connection
    try:
        r = redis.Redis.from_url(settings.REDIS_URL, socket_timeout=2.0)
        r.ping()
    except Exception as e:
        redis_status = "unhealthy"
        details["redis_error"] = str(e)
        
    overall_status = "healthy" if postgres_status == "healthy" and redis_status == "healthy" else "degraded"
    
    response_data = {
        "status": overall_status,
        "database": postgres_status,
        "redis": redis_status
    }
    if details:
        response_data["details"] = details
        
    if postgres_status == "unhealthy":
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=response_data
        )
            
    return response_data
