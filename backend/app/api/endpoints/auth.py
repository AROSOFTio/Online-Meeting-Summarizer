import re
from datetime import timedelta
from pydantic import BaseModel, Field, EmailStr

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core import deps, security
from app.core.initial_setup import consume
from app.core.audit import log_action
from app.core.config import settings
from app.models.models import User
from app.schemas.schemas import Token, UserOut

router = APIRouter()

class PasswordChange(BaseModel):
    current_password: str
    new_password: str

@router.post("/change-password")
def change_password(
    payload: PasswordChange,
    request: Request,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
):
    if not security.verify_password(payload.current_password, current_user.hashed_password):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    new = payload.new_password
    if len(new) < 8 or not re.search(r"[A-Z]", new) or not re.search(r"[a-z]", new) or not re.search(r"[^A-Za-z0-9]", new):
        raise HTTPException(status_code=400, detail="Use at least 8 characters, uppercase, lowercase and a special character.")
    if security.verify_password(new, current_user.hashed_password):
        raise HTTPException(status_code=400, detail="Choose a different password")
    current_user.hashed_password = security.get_password_hash(new)
    current_user.must_change_password = False
    db.commit()
    log_action(db, action="change_password", details="User changed password", user_id=current_user.id, user_email=current_user.email, ip_address=request.client.host if request.client else None)
    return {"detail": "Password updated"}



@router.post("/login", response_model=Token)
def login_access_token(
    response: Response,
    request: Request,
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(deps.get_db),
):
    """Authenticate staff/admin and set cookie-based session."""
    login_email = form_data.username.strip().lower()
    user = db.query(User).filter(func.lower(User.email) == login_email).first()

    if not user or not security.verify_password(form_data.password, user.hashed_password):
        log_action(
            db,
            action="login_failed",
            details=f"Failed login attempt for user: {login_email}",
            ip_address=request.client.host if request.client else None,
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Incorrect email or password",
        )

    if not user.is_active:
        log_action(
            db,
            action="login_failed_inactive",
            details=f"Inactive account login attempt for user: {login_email}",
            user_id=user.id,
            user_email=user.email,
            ip_address=request.client.host if request.client else None,
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Inactive user account",
        )

    access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = security.create_access_token(
        data={"sub": user.email}, expires_delta=access_token_expires
    )

    response.set_cookie(
        key=settings.session_cookie_name,
        value=access_token,
        httponly=True,
        max_age=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        expires=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        samesite="lax",
        secure=settings.PUBLIC_APP_URL.startswith("https://"),
        path="/",
    )

    log_action(
        db,
        action="login_success",
        details="User logged in successfully",
        user_id=user.id,
        user_email=user.email,
        ip_address=request.client.host if request.client else None,
    )

    return {"access_token": access_token, "token_type": "bearer"}


@router.post("/logout")
def logout(
    response: Response,
    request: Request,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
):
    response.delete_cookie(settings.session_cookie_name, path="/", samesite="lax", secure=settings.PUBLIC_APP_URL.startswith("https://"), httponly=True)
    log_action(
        db,
        action="logout",
        details="User logged out",
        user_id=current_user.id,
        user_email=current_user.email,
        ip_address=request.client.host if request.client else None,
    )
    return {"detail": "Successfully logged out"}


@router.get("/me", response_model=UserOut)
def read_users_me(current_user: User = Depends(deps.get_current_user)):
    return current_user


class InitialSetup(BaseModel):
    email: EmailStr
    code: str = Field(min_length=43,max_length=43)
    password: str = Field(min_length=12,max_length=128)

@router.post("/setup")
def initial_setup(body:InitialSetup,db:Session=Depends(deps.get_db)):
    try:
        success=consume(db,str(body.email).lower(),body.code,body.password)
    except ValueError as exc:
        raise HTTPException(422,str(exc)) from exc
    if not success:
        raise HTTPException(400,"Invalid, expired or already-used setup code")
    return {"detail":"Administrator password set"}
