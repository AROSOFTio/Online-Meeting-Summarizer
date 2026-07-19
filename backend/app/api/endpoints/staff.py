from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.orm import Session
from typing import List

from app.core import deps, security
from app.core.audit import log_action
from app.models.models import User, UserRole
from app.schemas.schemas import UserCreate, UserOut, UserUpdate

router = APIRouter()

@router.get("", response_model=List[UserOut], include_in_schema=False)
@router.get("/", response_model=List[UserOut])
def read_staff(
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_admin_user)
):
    """Retrieve list of staff accounts (Admin Only)"""
    return db.query(User).all()

@router.post("", response_model=UserOut, status_code=status.HTTP_201_CREATED, include_in_schema=False)
@router.post("/", response_model=UserOut, status_code=status.HTTP_201_CREATED)
def create_staff(
    request: Request,
    user_in: UserCreate,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_admin_user)
):
    """Create a new staff member account (Admin Only)"""
    existing_user = db.query(User).filter(User.email == user_in.email).first()
    if existing_user:
        raise HTTPException(
            status_code=400,
            detail="The user with this email already exists"
        )
    
    hashed_password = security.get_password_hash(user_in.password)
    new_user = User(
        email=user_in.email,
        hashed_password=hashed_password,
        full_name=user_in.full_name,
        role=user_in.role,
        is_active=user_in.is_active
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    
    log_action(
        db,
        action="create_staff",
        details=f"Admin created staff: {new_user.email} (Role: {new_user.role.value})",
        user_id=current_user.id,
        user_email=current_user.email,
        ip_address=request.client.host if request.client else None
    )
    return new_user

@router.put("/{user_id}", response_model=UserOut)
def update_staff(
    user_id: int,
    request: Request,
    user_in: UserUpdate,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_admin_user)
):
    """Update a staff member account (Admin Only)"""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
        
    # Prevent self-deactivation or self-role-change
    if user.id == current_user.id:
        if user_in.is_active is False:
            raise HTTPException(status_code=400, detail="Admins cannot deactivate themselves")
        if user_in.role and user_in.role != UserRole.admin:
            raise HTTPException(status_code=400, detail="Admins cannot change their own role")
            
    if user_in.email:
        existing_user = db.query(User).filter(User.email == user_in.email, User.id != user_id).first()
        if existing_user:
            raise HTTPException(status_code=400, detail="The user with this email already exists")
        user.email = user_in.email
        
    if user_in.full_name is not None:
        user.full_name = user_in.full_name
    if user_in.role is not None:
        user.role = user_in.role
    if user_in.is_active is not None:
        user.is_active = user_in.is_active
    if user_in.password:
        user.hashed_password = security.get_password_hash(user_in.password)
        
    db.commit()
    db.refresh(user)
    
    log_action(
        db,
        action="update_staff",
        details=f"Admin updated staff: {user.email} (Active: {user.is_active}, Role: {user.role.value})",
        user_id=current_user.id,
        user_email=current_user.email,
        ip_address=request.client.host if request.client else None
    )
    return user

@router.delete("/{user_id}", response_model=UserOut)
def deactivate_staff(
    user_id: int,
    request: Request,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_admin_user)
):
    """Deactivate a staff member account (Admin Only)"""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user.id == current_user.id:
        raise HTTPException(status_code=400, detail="Admins cannot deactivate themselves")
        
    user.is_active = False
    db.commit()
    db.refresh(user)
    
    log_action(
        db,
        action="deactivate_staff",
        details=f"Admin deactivated staff: {user.email}",
        user_id=current_user.id,
        user_email=current_user.email,
        ip_address=request.client.host if request.client else None
    )
    return user
