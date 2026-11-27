from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.core import deps
from app.core.subscriptions import snapshot
from app.models.models import User
router=APIRouter()
@router.get("")
@router.get("/")
def subscription(db:Session=Depends(deps.get_db),user:User=Depends(deps.get_current_user)):
    return snapshot(db)
