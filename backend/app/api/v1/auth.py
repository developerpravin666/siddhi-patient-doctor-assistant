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
from sqlalchemy import select, or_
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db, sanitize_schema_name
from app.core.tenant_context import get_tenant_override
from app.core.security import verify_password, create_access_token, decode_access_token, get_password_hash
from app.models.domain import AdminUser, Tenant, get_default_permissions
from app.models.schemas import LoginRequest, TokenResponse, AdminUserOut, UserProfileUpdate

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


async def resolve_user_tenant_schema(
    user: AdminUser,
    db_session: AsyncSession,
    override_tenant: Optional[str] = None
) -> str:
    """
    Resolves the PostgreSQL schema name for the given user's clinic tenant.
    For Super Admins (Product Owner):
      - If an override header (X-Tenant-ID / X-Tenant-Schema) is provided, resolves to that clinic's schema.
      - Otherwise, resolves the first active tenant schema, or falls back to 'public'.
    For Clinic Admins and Staff:
      - Strictly locked to their assigned tenant schema.
    """
    # 1. Super Admin Context Switching / Impersonation
    if user.role == "SUPER_ADMIN":
        target = override_tenant or get_tenant_override()
        if target:
            clean_target = str(target).strip()
            stmt = select(Tenant.schema_name).where(
                or_(Tenant.id == clean_target, Tenant.schema_name == clean_target)
            )
            res = await db_session.execute(stmt)
            target_schema = res.scalar_one_or_none()
            if target_schema:
                return sanitize_schema_name(target_schema)
            logger.warning(f"Super Admin requested unknown or invalid tenant override: '{clean_target}'")

    # 2. Clinic Admin / Staff assigned tenant
    if user.tenant_id:
        stmt = select(Tenant.schema_name).where(Tenant.id == user.tenant_id)
        res = await db_session.execute(stmt)
        assigned_schema = res.scalar_one_or_none()
        if assigned_schema:
            return sanitize_schema_name(assigned_schema)

    # 3. Fallback: First Active Tenant
    stmt = select(Tenant.schema_name).where(Tenant.status == "ACTIVE").limit(1)
    res = await db_session.execute(stmt)
    active_schema = res.scalar_one_or_none()
    if active_schema:
        return sanitize_schema_name(active_schema)

    # 4. Next fallback: any existing tenant in public.tenants
    any_tenant = await db_session.execute(select(Tenant.schema_name).limit(1))
    any_schema = any_tenant.scalar_one_or_none()
    if any_schema:
        return sanitize_schema_name(any_schema)

    return "public"


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


@router.put("/profile", response_model=AdminUserOut)
async def update_my_profile(
    payload: UserProfileUpdate,
    current_user: AdminUser = Depends(get_current_admin),
    db_session: AsyncSession = Depends(get_db)
):
    """
    Allows any authenticated user (e.g. Clinic Admin / Doctor) to update their
    own personal profile (full name, password).
    """
    from sqlalchemy import text

    if payload.full_name is not None and payload.full_name.strip():
        current_user.full_name = payload.full_name.strip()
        await db_session.execute(
            text("UPDATE public.admin_users SET full_name = :fn, updated_at = CURRENT_TIMESTAMP WHERE id = :id"),
            {"fn": current_user.full_name, "id": current_user.id}
        )

    if payload.password is not None and payload.password.strip():
        new_hash = get_password_hash(payload.password.strip())
        current_user.hashed_password = new_hash
        await db_session.execute(
            text("UPDATE public.admin_users SET hashed_password = :hp, updated_at = CURRENT_TIMESTAMP WHERE id = :id"),
            {"hp": new_hash, "id": current_user.id}
        )

    # Sync to tenant schema if applicable
    if current_user.tenant_id:
        try:
            tenant_schema = await resolve_user_tenant_schema(current_user, db_session)
            if tenant_schema and tenant_schema != "public":
                if payload.full_name is not None and payload.full_name.strip():
                    await db_session.execute(
                        text(f'UPDATE "{tenant_schema}".admin_users SET full_name = :fn, updated_at = CURRENT_TIMESTAMP WHERE username = :un'),
                        {"fn": current_user.full_name, "un": current_user.username}
                    )
                if payload.password is not None and payload.password.strip():
                    await db_session.execute(
                        text(f'UPDATE "{tenant_schema}".admin_users SET hashed_password = :hp, updated_at = CURRENT_TIMESTAMP WHERE username = :un'),
                        {"hp": current_user.hashed_password, "un": current_user.username}
                    )
        except Exception as e:
            logger.warning(f"Could not sync profile to tenant schema: {e}")

    await db_session.commit()
    return current_user


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)

