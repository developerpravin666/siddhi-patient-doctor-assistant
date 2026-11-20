import sys
from pathlib import Path

# Ensure backend root is on sys.path if run directly as a script
backend_root = Path(__file__).resolve().parent.parent.parent.parent
if str(backend_root) not in sys.path:
    sys.path.insert(0, str(backend_root))

import logging
from typing import Optional, List, Callable
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db
from app.core.security import verify_password, create_access_token, decode_access_token
from app.models.domain import AdminUser, Tenant, get_default_permissions
from app.models.schemas import LoginRequest, TokenResponse, AdminUserOut

router = APIRouter(prefix="/auth", tags=["Authentication"])
logger = logging.getLogger("auth_api")

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login", auto_error=False)


async def get_current_admin(
    token: Optional[str] = Depends(oauth2_scheme),
    db_session: AsyncSession = Depends(get_db)
) -> AdminUser:
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication token missing",
            headers={"WWW-Authenticate": "Bearer"},
        )

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

    if not user:
        # Check public schema fallback
        try:
            from sqlalchemy import text
            pub_res = await db_session.execute(
                text("SELECT id, username, hashed_password, full_name, role, tenant_id, clinic_id, permissions, is_active FROM public.admin_users WHERE username = :u"),
                {"u": username}
            )
            row = pub_res.mappings().first()
            if row:
                user = AdminUser(**dict(row))
        except Exception:
            pass

    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found or inactive")

    return user


async def get_optional_admin(
    token: Optional[str] = Depends(oauth2_scheme),
    db_session: AsyncSession = Depends(get_db)
) -> Optional[AdminUser]:
    """
    Returns the authenticated AdminUser if a valid token is provided, or None if unauthenticated.
    """
    if not token:
        return None
    try:
        return await get_current_admin(token=token, db_session=db_session)
    except Exception:
        return None


def require_roles(allowed_roles: List[str]) -> Callable:
    """
    Role-Based Access Control (RBAC) dependency factory.
    Allowed roles: 'SUPER_ADMIN', 'CLINIC_ADMIN', 'RECEPTIONIST'.
    """
    async def role_checker(current_user: AdminUser = Depends(get_current_admin)) -> AdminUser:
        if current_user.role not in allowed_roles:
            logger.warning(
                f"Unauthorized access attempt by '{current_user.username}' (role: {current_user.role}) "
                f"requiring roles: {allowed_roles}"
            )
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access denied: Role '{current_user.role}' lacks permission for this action."
            )
        return current_user
    return role_checker


def require_permission(screen: str, action: str = "view") -> Callable:
    """
    Granular screen access and action permission dependency factory.
    - Super Admin has global access to all features.
    - Clinic Admin (Doctor) has full control over their clinic tenant.
    - Receptionist (Front Desk) checks their assigned screen and action permissions (view, create, edit, delete).
    """
    async def permission_checker(current_user: AdminUser = Depends(get_current_admin)) -> AdminUser:
        if current_user.role in ["SUPER_ADMIN", "CLINIC_ADMIN"]:
            return current_user

        # Evaluate Front Desk granular permissions matrix
        user_perms = current_user.permissions or get_default_permissions(current_user.role)
        screen_perms = user_perms.get(screen, {})
        has_permission = screen_perms.get(action, False)

        if not has_permission:
            logger.warning(
                f"Permission denied for '{current_user.username}' (role: {current_user.role}) "
                f"attempting action '{action}' on screen '{screen}'"
            )
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access denied: You do not have permission to '{action}' on '{screen}'. Please contact your Clinic Doctor/Admin."
            )
        return current_user
    return permission_checker


async def resolve_user_tenant_schema(user: AdminUser, db_session: AsyncSession) -> str:
    """
    Resolves the PostgreSQL schema name for the given user's clinic tenant.
    For Clinic Admins and staff, resolves directly from their assigned tenant.
    For Super Admins (Product Owner), resolves the first active tenant schema, or falls back to 'public'.
    """
    if user.tenant_id:
        stmt = select(Tenant).where(Tenant.id == user.tenant_id)
        tenant = (await db_session.execute(stmt)).scalar_one_or_none()
        if tenant and getattr(tenant, "schema_name", None):
            return tenant.schema_name

    stmt = select(Tenant.schema_name).where(Tenant.status == "ACTIVE").limit(1)
    res = await db_session.execute(stmt)
    active_schema = res.scalar_one_or_none()
    if active_schema:
        return active_schema

    return "clinic_default"


@router.post("/login", response_model=TokenResponse)
async def login(credentials: LoginRequest, db_session: AsyncSession = Depends(get_db)):
    stmt = select(AdminUser).where(AdminUser.username == credentials.username.strip())
    result = await db_session.execute(stmt)
    user = result.scalar_one_or_none()

    if not user:
        # Check public schema fallback
        try:
            from sqlalchemy import text
            pub_res = await db_session.execute(
                text("SELECT id, username, hashed_password, full_name, role, tenant_id, clinic_id, permissions, is_active FROM public.admin_users WHERE username = :u"),
                {"u": credentials.username.strip()}
            )
            row = pub_res.mappings().first()
            if row:
                user = AdminUser(**dict(row))
        except Exception:
            pass

    if not user or not verify_password(credentials.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password"
        )

    # Resolve dedicated tenant schema
    tenant_schema = await resolve_user_tenant_schema(user, db_session)
    user_perms = user.permissions or get_default_permissions(user.role)

    access_token = create_access_token(data={
        "sub": user.username,
        "role": user.role,
        "tenant_id": user.tenant_id,
        "clinic_id": user.clinic_id,
        "schema_name": tenant_schema
    })
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": {
            "id": user.id,
            "username": user.username,
            "full_name": user.full_name,
            "role": user.role,
            "tenant_id": user.tenant_id,
            "clinic_id": user.clinic_id,
            "schema_name": tenant_schema,
            "permissions": user_perms
        }
    }


@router.get("/me", response_model=AdminUserOut)
async def get_me(current_user: AdminUser = Depends(get_current_admin)):
    return current_user


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)

