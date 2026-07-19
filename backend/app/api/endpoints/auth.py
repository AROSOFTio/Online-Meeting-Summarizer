from fastapi import APIRouter, Depends, HTTPException, status, Response, Request
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from datetime import timedelta

from app.core import security, deps
from app.core.config import settings
from app.core.audit import log_action
from app.models.models import User
from app.schemas.schemas import UserOut, Token

router = APIRouter()

@router.post("/login", response_model=Token)
def login_access_token(
    response: Response,
    request: Request,
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(deps.get_db)
):
    """Authenticate staff/admin and set cookie-based session"""
    user = db.query(User).filter(User.email == form_data.username).first()
    if not user or not security.verify_password(form_data.password, user.hashed_password):
        log_action(
            db,
            action="login_failed",
            details=f"Failed login attempt for user: {form_data.username}",
            ip_address=request.client.host if request.client else None
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Incorrect email or password"
        )
    if not user.is_active:
        log_action(
            db,
            action="login_failed_inactive",
            details=f"Inactive account login attempt for user: {form_data.username}",
            user_id=user.id,
            user_email=user.email,
            ip_address=request.client.host if request.client else None
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Inactive user account"
        )

    access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = security.create_access_token(
        data={"sub": user.email}, expires_delta=access_token_expires
    )

    # Set secure HttpOnly cookie
    response.set_cookie(
        key="session_token",
        value=access_token,
        httponly=True,
        max_age=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        expires=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        samesite="lax",
        secure=False,  # Set to True in production with HTTPS, False for local dev
        path="/"
    )

    log_action(
        db,
        action="login_success",
        details="User logged in successfully",
        user_id=user.id,
        user_email=user.email,
        ip_address=request.client.host if request.client else None
    )

    return {"access_token": access_token, "token_type": "bearer"}

@router.post("/logout")
def logout(response: Response, request: Request, db: Session = Depends(deps.get_db), current_user: User = Depends(deps.get_current_user)):
    """Log out user and clear cookie"""
    response.delete_cookie("session_token", path="/", samesite="lax")
    log_action(
        db,
        action="logout",
        details="User logged out",
        user_id=current_user.id,
        user_email=current_user.email,
        ip_address=request.client.host if request.client else None
    )
    return {"detail": "Successfully logged out"}

@router.get("/me", response_model=UserOut)
def read_users_me(current_user: User = Depends(deps.get_current_user)):
    """Retrieve current logged in user details"""
    return current_user
