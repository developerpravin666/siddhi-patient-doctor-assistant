import logging
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db
from app.core.security import verify_password, create_access_token, decode_access_token
from app.models.domain import AdminUser
from app.models.schemas import LoginRequest, TokenResponse, AdminUserOut

router = APIRouter(prefix="/auth", tags=["Authentication"])
logger = logging.getLogger("auth_api")

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login")


async def get_current_admin(
    token: str = Depends(oauth2_scheme),
    db_session: AsyncSession = Depends(get_db)
) -> AdminUser:
    payload = decode_access_token(token)
    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )
    username: Optional[str] = payload.get("sub")
    if not username:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token subject")

    stmt = select(AdminUser).where(AdminUser.username == username)
    result = await db_session.execute(stmt)
    user = result.scalar_one_or_none()

    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found or inactive")

    return user


@router.post("/login", response_model=TokenResponse)
async def login(credentials: LoginRequest, db_session: AsyncSession = Depends(get_db)):
    stmt = select(AdminUser).where(AdminUser.username == credentials.username.strip())
    result = await db_session.execute(stmt)
    user = result.scalar_one_or_none()

    if not user or not verify_password(credentials.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password"
        )

    access_token = create_access_token(data={"sub": user.username, "role": user.role})
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": {
            "id": user.id,
            "username": user.username,
            "full_name": user.full_name,
            "role": user.role,
            "tenant_id": user.tenant_id
        }
    }


@router.get("/me", response_model=AdminUserOut)
async def get_me(current_user: AdminUser = Depends(get_current_admin)):
    return current_user
