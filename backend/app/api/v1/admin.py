import logging
import json
from datetime import datetime, timezone
from typing import List, Dict, Any, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status, Response
from sqlalchemy import select, text, func, asc, desc, or_, and_
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.config import settings
from app.core.database import get_db, sanitize_schema_name, provision_tenant_schema, is_postgres
from app.core.security import get_password_hash
from app.models.domain import Tenant, Clinic, Doctor, Patient, Appointment, AdminUser, Specialization, WebhookEvent, get_default_permissions
from app.models.schemas import (
    DoctorOut, DoctorCreate, DoctorUpdate, DoctorStatusUpdate,
    ClinicOut, ClinicCreate, ClinicUpdate,
    PatientOut, PatientCreate, PatientUpdate, PatientStatusUpdate,
    TenantOut, TenantCreate, TenantUpdate,
    AdminUserOut, AdminUserCreate, AdminUserUpdate,
    SpecializationOut, SpecializationCreate, SpecializationUpdate, SpecializationStatusUpdate,
    WhatsAppConfigOut, WhatsAppConfigUpdate, WhatsAppTestRequest,
    WebhookEventOut
)
from app.api.v1.auth import get_current_admin, get_optional_admin, require_roles, require_permission, resolve_user_tenant_schema
from app.services.database_service import db

router = APIRouter(prefix="/admin", tags=["Admin Management"])
logger = logging.getLogger("admin_api")


@router.get("/stats")
async def get_admin_dashboard_stats(
    current_user: AdminUser = Depends(require_permission("analytics", "view")),
    db_session: AsyncSession = Depends(get_db)
):
    """
    Returns live KPIs: total appointments, today's appointments, confirmed,
    cancelled, active patients, doctors, and pending reminders.
    """
    tenant_schema = await resolve_user_tenant_schema(current_user, db_session)
    return await db.get_stats(tenant_schema=tenant_schema)


# -----------------------------------------------------------------------------
# Tenant Management (SUPER_ADMIN / Product Owner Only)
# Clinic = Tenant with Dedicated Isolated PostgreSQL Schema
# -----------------------------------------------------------------------------
@router.get("/tenants", response_model=List[TenantOut])
async def list_tenants(
    response: Response,
    search: Optional[str] = Query(None, description="Search clinic name, owner, phone, or email"),
    status_filter: Optional[str] = Query(None, description="ACTIVE, SUSPENDED, INACTIVE"),
    sort_by: Optional[str] = Query(None, description="Column to sort by"),
    sort_dir: Optional[str] = Query("desc", description="asc or desc"),
    page: Optional[int] = Query(None, ge=1),
    page_size: Optional[int] = Query(None, ge=1),
    limit: Optional[int] = None,
    offset: Optional[int] = None,
    db_session: AsyncSession = Depends(get_db),
    current_user: AdminUser = Depends(require_roles(["SUPER_ADMIN"]))
):
    stmt = select(Tenant)
    conditions = []
    if search:
        s = f"%{search}%"
        conditions.append(or_(
            Tenant.name.ilike(s),
            Tenant.owner_name.ilike(s),
            Tenant.owner_email.ilike(s),
            Tenant.owner_phone.ilike(s),
            Tenant.schema_name.ilike(s)
        ))
    if status_filter and status_filter != 'ALL':
        conditions.append(Tenant.status == status_filter.upper())

    if conditions:
        stmt = stmt.where(and_(*conditions))

    # Count total
    count_stmt = select(func.count(Tenant.id))
    if conditions:
        count_stmt = count_stmt.where(and_(*conditions))
    c_res = await db_session.execute(count_stmt)
    total_count = c_res.scalar_one_or_none() or 0
    response.headers["X-Total-Count"] = str(total_count)

    # Sort
    is_asc = (sort_dir or "").lower() == "asc"
    if sort_by == "name":
        stmt = stmt.order_by(asc(Tenant.name) if is_asc else desc(Tenant.name))
    elif sort_by == "owner_name":
        stmt = stmt.order_by(asc(Tenant.owner_name) if is_asc else desc(Tenant.owner_name))
    elif sort_by == "status":
        stmt = stmt.order_by(asc(Tenant.status) if is_asc else desc(Tenant.status))
    else:
        stmt = stmt.order_by(asc(Tenant.created_at) if is_asc else desc(Tenant.created_at))

    # Pagination
    if page is not None and page_size is not None:
        stmt = stmt.limit(page_size).offset((page - 1) * page_size)
    elif limit is not None:
        stmt = stmt.limit(limit).offset(offset or 0)

    result = await db_session.execute(stmt)
    return result.scalars().all()


@router.post("/tenants", response_model=TenantOut, status_code=status.HTTP_201_CREATED)
async def create_tenant(
    payload: TenantCreate,
    db_session: AsyncSession = Depends(get_db),
    current_user: AdminUser = Depends(require_roles(["SUPER_ADMIN"]))
):
    # Provision isolated PostgreSQL schema for this clinic tenant
    schema_name = payload.schema_name or sanitize_schema_name(f"clinic_{payload.name}")
    await provision_tenant_schema(schema_name)

    tenant = Tenant(
        name=payload.name,
        schema_name=schema_name,
        owner_name=payload.owner_name,
        owner_phone=payload.owner_phone,
        owner_email=payload.owner_email,
        status=payload.status
    )
    db_session.add(tenant)
    await db_session.flush()
    await db_session.commit()
    try:
        await db_session.refresh(tenant)
    except Exception:
        pass

    # 1. Automatically provision initial clinic profile inside the new tenant schema
    clinic_id = f"clinic_{tenant.id[:8]}"
    clinic = Clinic(
        id=clinic_id,
        tenant_id=tenant.id,
        name=payload.name,
        address="Main Facility Address",
        phone=payload.owner_phone or "",
        timezone="Asia/Kolkata",
        consultation_hours="Monday - Saturday: 9:00 AM - 1:00 PM, 4:00 PM - 7:30 PM (Sundays Closed)"
    )

    # 2. Determine initial Clinic Admin (Doctor / Tenant Admin) credentials
    raw_username = (payload.admin_username or "").strip()
    if not raw_username:
        if payload.owner_email:
            raw_username = payload.owner_email.split("@")[0].lower()
        else:
            raw_username = schema_name.replace("clinic_", "") + "_admin"

    raw_password = (payload.admin_password or "clinic123").strip()
    hashed_pwd = get_password_hash(raw_password)
    admin_fullname = payload.owner_name or f"{payload.name} Admin"

    if is_postgres():
        # Insert clinic into tenant schema
        await db_session.execute(text(f'SET search_path TO "{schema_name}", public;'))
        db_session.add(clinic)
        await db_session.flush()

        import uuid
        clinic_admin_id = str(uuid.uuid4())
        clinic_perms = json.dumps(get_default_permissions("CLINIC_ADMIN"))

        # Insert Clinic Admin in tenant schema admin_users
        await db_session.execute(text(f"""
            INSERT INTO "{schema_name}".admin_users 
            (id, username, hashed_password, full_name, role, tenant_id, clinic_id, permissions, is_active, created_at, updated_at)
            VALUES (:id, :u, :p, :fn, 'CLINIC_ADMIN', :tid, :cid, CAST(:perms AS json), TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            ON CONFLICT (id) DO NOTHING;
        """), {
            "id": clinic_admin_id,
            "u": raw_username,
            "p": hashed_pwd,
            "fn": admin_fullname,
            "tid": tenant.id,
            "cid": clinic.id,
            "perms": clinic_perms
        })

        # Also insert into public.admin_users for login resolution
        await db_session.execute(text("""
            INSERT INTO public.admin_users 
            (id, username, hashed_password, full_name, role, tenant_id, clinic_id, permissions, is_active, created_at, updated_at)
            VALUES (:id, :u, :p, :fn, 'CLINIC_ADMIN', :tid, :cid, CAST(:perms AS json), TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            ON CONFLICT (username) DO UPDATE SET
                tenant_id = EXCLUDED.tenant_id,
                clinic_id = EXCLUDED.clinic_id,
                role = EXCLUDED.role,
                permissions = EXCLUDED.permissions,
                hashed_password = EXCLUDED.hashed_password,
                updated_at = CURRENT_TIMESTAMP;
        """), {
            "id": clinic_admin_id,
            "u": raw_username,
            "p": hashed_pwd,
            "fn": admin_fullname,
            "tid": tenant.id,
            "cid": clinic.id,
            "perms": clinic_perms
        })
        await db_session.commit()
    else:
        db_session.add(clinic)
        db_session.add(AdminUser(
            username=raw_username,
            hashed_password=hashed_pwd,
            full_name=admin_fullname,
            role="CLINIC_ADMIN",
            tenant_id=tenant.id,
            clinic_id=clinic.id,
            permissions=get_default_permissions("CLINIC_ADMIN"),
            is_active=True
        ))
        await db_session.commit()

    logger.info(f"Clinic Tenant '{tenant.name}' provisioned with schema '{schema_name}' and Clinic Admin '{raw_username}' by '{current_user.username}'")
    tenant.admin_username = raw_username
    return tenant


@router.get("/tenants/{tenant_id}", response_model=TenantOut)
async def get_tenant(
    tenant_id: str,
    db_session: AsyncSession = Depends(get_db),
    current_user: AdminUser = Depends(require_roles(["SUPER_ADMIN"]))
):
    stmt = select(Tenant).where(Tenant.id == tenant_id)
    tenant = (await db_session.execute(stmt)).scalar_one_or_none()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")
    return tenant


@router.put("/tenants/{tenant_id}", response_model=TenantOut)
async def update_tenant(
    tenant_id: str,
    payload: TenantUpdate,
    db_session: AsyncSession = Depends(get_db),
    current_user: AdminUser = Depends(require_roles(["SUPER_ADMIN"]))
):
    stmt = select(Tenant).where(Tenant.id == tenant_id)
    tenant = (await db_session.execute(stmt)).scalar_one_or_none()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")

    if payload.name is not None:
        tenant.name = payload.name
    if payload.owner_name is not None:
        tenant.owner_name = payload.owner_name
    if payload.owner_phone is not None:
        tenant.owner_phone = payload.owner_phone
    if payload.owner_email is not None:
        tenant.owner_email = payload.owner_email
    if payload.status is not None:
        tenant.status = payload.status

    await db_session.flush()
    await db_session.commit()
    try:
        await db_session.refresh(tenant)
    except Exception:
        pass
    return tenant


# -----------------------------------------------------------------------------
# User Management (SUPER_ADMIN for all, CLINIC_ADMIN for Front Desk staff)
# Clinic Admin manages Front Desk users and assigns Screen & Action Permissions
# -----------------------------------------------------------------------------
@router.get("/users", response_model=List[AdminUserOut])
async def list_users(
    response: Response,
    tenant_id: Optional[str] = None,
    search: Optional[str] = Query(None, description="Search by full name or username"),
    role: Optional[str] = Query(None, description="SUPER_ADMIN, CLINIC_ADMIN, RECEPTIONIST"),
    sort_by: Optional[str] = Query(None, description="Column to sort by"),
    sort_dir: Optional[str] = Query("asc", description="asc or desc"),
    page: Optional[int] = Query(None, ge=1),
    page_size: Optional[int] = Query(None, ge=1),
    limit: Optional[int] = None,
    offset: Optional[int] = None,
    db_session: AsyncSession = Depends(get_db),
    current_user: AdminUser = Depends(require_roles(["SUPER_ADMIN", "CLINIC_ADMIN"]))
):
    stmt = select(AdminUser)
    conditions = []

    if current_user.role == "CLINIC_ADMIN":
        conditions.append(AdminUser.tenant_id == current_user.tenant_id)
    elif tenant_id:
        conditions.append(AdminUser.tenant_id == tenant_id)

    if role and role != 'ALL':
        conditions.append(AdminUser.role == role.upper())

    if search:
        s = f"%{search}%"
        conditions.append(or_(AdminUser.full_name.ilike(s), AdminUser.username.ilike(s)))

    if conditions:
        stmt = stmt.where(and_(*conditions))

    # Count total
    count_stmt = select(func.count(AdminUser.id))
    if conditions:
        count_stmt = count_stmt.where(and_(*conditions))
    c_res = await db_session.execute(count_stmt)
    total_count = c_res.scalar_one_or_none() or 0
    response.headers["X-Total-Count"] = str(total_count)

    # Sorting
    is_asc = (sort_dir or "").lower() == "asc"
    if sort_by == "username":
        stmt = stmt.order_by(asc(AdminUser.username) if is_asc else desc(AdminUser.username))
    elif sort_by == "role":
        stmt = stmt.order_by(asc(AdminUser.role) if is_asc else desc(AdminUser.role))
    elif sort_by == "is_active":
        stmt = stmt.order_by(asc(AdminUser.is_active) if is_asc else desc(AdminUser.is_active))
    elif sort_by == "created_at":
        stmt = stmt.order_by(asc(AdminUser.created_at) if is_asc else desc(AdminUser.created_at))
    else:
        stmt = stmt.order_by(asc(AdminUser.full_name) if is_asc else desc(AdminUser.full_name))

    # Pagination
    if page is not None and page_size is not None:
        stmt = stmt.limit(page_size).offset((page - 1) * page_size)
    elif limit is not None:
        stmt = stmt.limit(limit).offset(offset or 0)

    result = await db_session.execute(stmt)
    return result.scalars().all()


@router.get("/users/{user_id}", response_model=AdminUserOut)
async def get_user(
    user_id: str,
    db_session: AsyncSession = Depends(get_db),
    current_user: AdminUser = Depends(require_roles(["SUPER_ADMIN", "CLINIC_ADMIN"]))
):
    stmt = select(AdminUser).where(AdminUser.id == user_id)
    user = (await db_session.execute(stmt)).scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if current_user.role == "CLINIC_ADMIN" and user.tenant_id != current_user.tenant_id:
        raise HTTPException(status_code=403, detail="Cannot access user from another tenant")
    return user


@router.post("/users", response_model=AdminUserOut, status_code=status.HTTP_201_CREATED)
async def create_user(
    payload: AdminUserCreate,
    db_session: AsyncSession = Depends(get_db),
    current_user: AdminUser = Depends(require_roles(["SUPER_ADMIN", "CLINIC_ADMIN"]))
):
    # Only Super Admin can create Super Admins or Clinic Admins
    if current_user.role == "CLINIC_ADMIN" and payload.role in ["SUPER_ADMIN", "CLINIC_ADMIN"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Clinic Admin can only create Receptionist / Front Desk staff."
        )

    # Check for duplicate username
    stmt = select(AdminUser).where(AdminUser.username == payload.username.strip())
    existing = (await db_session.execute(stmt)).scalar_one_or_none()
    if existing:
        raise HTTPException(status_code=400, detail="Username already exists")

    # Use custom screen permissions if provided, or role default
    assigned_permissions = payload.permissions or get_default_permissions(payload.role)

    import uuid
    new_user_id = str(uuid.uuid4())
    new_user = AdminUser(
        id=new_user_id,
        username=payload.username.strip(),
        hashed_password=get_password_hash(payload.password),
        full_name=payload.full_name.strip(),
        role=payload.role,
        tenant_id=payload.tenant_id or current_user.tenant_id,
        clinic_id=payload.clinic_id or current_user.clinic_id,
        permissions=assigned_permissions,
        is_active=True
    )
    db_session.add(new_user)
    await db_session.commit()

    # Persist user in clinic's dedicated tenant schema as well
    tenant_schema = await resolve_user_tenant_schema(current_user, db_session)
    if is_postgres() and tenant_schema:
        try:
            await db_session.execute(text(f"""
                INSERT INTO "{tenant_schema}".admin_users (id, username, hashed_password, full_name, role, tenant_id, clinic_id, permissions, is_active, created_at, updated_at)
                VALUES (:id, :username, :pwd, :name, :role, :tid, :cid, CAST(:perms AS json), :active, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                ON CONFLICT (id) DO UPDATE SET 
                    full_name = EXCLUDED.full_name,
                    role = EXCLUDED.role,
                    permissions = EXCLUDED.permissions,
                    is_active = EXCLUDED.is_active,
                    updated_at = CURRENT_TIMESTAMP;
            """), {
                "id": new_user.id,
                "username": new_user.username,
                "pwd": new_user.hashed_password,
                "name": new_user.full_name,
                "role": new_user.role,
                "tid": new_user.tenant_id,
                "cid": new_user.clinic_id,
                "perms": json.dumps(new_user.permissions) if new_user.permissions else None,
                "active": new_user.is_active
            })
            await db_session.commit()
        except Exception as e:
            logger.warning(f"Failed to persist user in tenant schema '{tenant_schema}': {e}")

    logger.info(f"User '{new_user.username}' (role: {new_user.role}) created and stored in tenant schema '{tenant_schema}'.")
    return new_user


@router.put("/users/{user_id}", response_model=AdminUserOut)
async def update_user(
    user_id: str,
    payload: AdminUserUpdate,
    db_session: AsyncSession = Depends(get_db),
    current_user: AdminUser = Depends(require_roles(["SUPER_ADMIN", "CLINIC_ADMIN"]))
):
    stmt = select(AdminUser).where(AdminUser.id == user_id)
    user = (await db_session.execute(stmt)).scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if current_user.role == "CLINIC_ADMIN" and user.tenant_id != current_user.tenant_id:
        raise HTTPException(status_code=403, detail="Cannot edit user from another tenant")

    if payload.full_name is not None:
        user.full_name = payload.full_name
    if payload.role is not None:
        if current_user.role != "SUPER_ADMIN" and payload.role != user.role:
            raise HTTPException(status_code=403, detail="Only Super Admin can change user roles")
        user.role = payload.role
    if payload.permissions is not None:
        user.permissions = payload.permissions
    if payload.is_active is not None:
        user.is_active = payload.is_active
    if payload.password is not None and len(payload.password) >= 6:
        user.hashed_password = get_password_hash(payload.password)

    await db_session.flush()
    await db_session.commit()
    try:
        await db_session.refresh(user)
    except Exception:
        pass

    # Sync updates to tenant schema table
    tenant_schema = await resolve_user_tenant_schema(current_user, db_session)
    if is_postgres() and tenant_schema:
        try:
            await db_session.execute(text(f"""
                UPDATE "{tenant_schema}".admin_users 
                SET full_name = :name, role = :role, permissions = :perms, is_active = :active, updated_at = CURRENT_TIMESTAMP
                WHERE id = :id;
            """), {
                "id": user.id,
                "name": user.full_name,
                "role": user.role,
                "perms": json.dumps(user.permissions) if user.permissions else None,
                "active": user.is_active
            })
            await db_session.commit()
        except Exception:
            pass

    return user


@router.delete("/users/{user_id}", status_code=status.HTTP_200_OK)
async def delete_user(
    user_id: str,
    db_session: AsyncSession = Depends(get_db),
    current_user: AdminUser = Depends(require_roles(["SUPER_ADMIN", "CLINIC_ADMIN"]))
):
    # Prevent self-deletion
    if user_id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot delete your own user account")

    # 1. Search in public.admin_users
    stmt = select(AdminUser).where(AdminUser.id == user_id)
    user = (await db_session.execute(stmt)).scalar_one_or_none()

    # 2. If not found in public and postgres, search active tenant schemas
    tenant_schema = await resolve_user_tenant_schema(current_user, db_session)
    if not user and is_postgres():
        try:
            t_res = await db_session.execute(text("SELECT schema_name FROM public.tenants WHERE status='ACTIVE';"))
            for (s_name,) in t_res.fetchall():
                safe_s = sanitize_schema_name(s_name)
                await db_session.execute(text(f'SET search_path TO "{safe_s}", public;'))
                cand = (await db_session.execute(stmt)).scalar_one_or_none()
                if cand:
                    user = cand
                    tenant_schema = safe_s
                    break
        except Exception:
            pass

    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Guard: default superadmin cannot be deleted
    if user.username == "superadmin":
        raise HTTPException(status_code=400, detail="Cannot delete the default Super Admin account")

    # Guard: Clinic Admin can only delete users belonging to their own tenant
    if current_user.role == "CLINIC_ADMIN" and user.tenant_id != current_user.tenant_id:
        raise HTTPException(status_code=403, detail="Cannot delete staff from another clinic tenant")

    # Guard: Non-Super Admin cannot delete Super Admin
    if user.role == "SUPER_ADMIN" and current_user.role != "SUPER_ADMIN":
        raise HTTPException(status_code=403, detail="Cannot delete a Super Admin account")

    # Delete from tenant schemas if postgres
    if is_postgres():
        schemas_to_clean = set()
        if tenant_schema:
            schemas_to_clean.add(tenant_schema)
        if user.tenant_id:
            try:
                res_t = await db_session.execute(text("SELECT schema_name FROM public.tenants WHERE id = :tid;"), {"tid": user.tenant_id})
                u_schema = res_t.scalar_one_or_none()
                if u_schema:
                    schemas_to_clean.add(sanitize_schema_name(u_schema))
            except Exception:
                pass

        for s_clean in schemas_to_clean:
            try:
                await db_session.execute(text(f'DELETE FROM "{s_clean}".admin_users WHERE id = :id;'), {"id": user_id})
            except Exception:
                pass

    try:
        await db_session.delete(user)
    except Exception:
        if is_postgres():
            await db_session.execute(text('DELETE FROM public.admin_users WHERE id = :id;'), {"id": user_id})

    await db_session.commit()
    logger.info(f"User account '{user.username}' (id: {user_id}) deleted successfully by '{current_user.username}'.")
    return {"message": "User deleted successfully", "id": user_id}


# -----------------------------------------------------------------------------
# Clinic Management
# -----------------------------------------------------------------------------
@router.get("/clinics", response_model=List[ClinicOut])
async def list_clinics(
    db_session: AsyncSession = Depends(get_db),
    current_user: Optional[AdminUser] = Depends(get_optional_admin)
):
    clinics = []
    if is_postgres():
        if current_user and current_user.tenant_id:
            tenant_schema = await resolve_user_tenant_schema(current_user, db_session)
            await db_session.execute(text(f'SET search_path TO "{tenant_schema}", public;'))
            stmt = select(Clinic)
            clinics = (await db_session.execute(stmt)).scalars().all()

        if not clinics:
            # Query active tenant schemas to aggregate clinics
            try:
                res = await db_session.execute(text("SELECT schema_name FROM public.tenants WHERE status='ACTIVE' ORDER BY created_at ASC;"))
                active_schemas = res.scalars().all()
                for s_name in active_schemas:
                    try:
                        safe_s = sanitize_schema_name(s_name)
                        await db_session.execute(text(f'SET search_path TO "{safe_s}", public;'))
                        c_res = await db_session.execute(select(Clinic))
                        for c in c_res.scalars().all():
                            if not any(existing.id == c.id for existing in clinics):
                                clinics.append(c)
                    except Exception:
                        pass
            except Exception:
                pass

        if not clinics:
            # Fallback to public schema
            try:
                await db_session.execute(text('SET search_path TO public;'))
                stmt = select(Clinic)
                clinics = (await db_session.execute(stmt)).scalars().all()
            except Exception:
                pass
    else:
        stmt = select(Clinic)
        clinics = (await db_session.execute(stmt)).scalars().all()

    return clinics


@router.get("/clinics/{clinic_id}", response_model=ClinicOut)
async def get_clinic(
    clinic_id: str,
    db_session: AsyncSession = Depends(get_db),
    current_user: Optional[AdminUser] = Depends(get_optional_admin)
):
    clinic = None
    if is_postgres():
        if current_user and current_user.tenant_id:
            tenant_schema = await resolve_user_tenant_schema(current_user, db_session)
            await db_session.execute(text(f'SET search_path TO "{tenant_schema}", public;'))
            stmt = select(Clinic).where(Clinic.id == clinic_id)
            clinic = (await db_session.execute(stmt)).scalar_one_or_none()

        if not clinic:
            # Search across active tenant schemas
            try:
                res = await db_session.execute(text("SELECT schema_name FROM public.tenants WHERE status='ACTIVE' ORDER BY created_at ASC;"))
                active_schemas = res.scalars().all()
                for s_name in active_schemas:
                    try:
                        safe_s = sanitize_schema_name(s_name)
                        await db_session.execute(text(f'SET search_path TO "{safe_s}", public;'))
                        stmt = select(Clinic).where(Clinic.id == clinic_id)
                        clinic = (await db_session.execute(stmt)).scalar_one_or_none()
                        if clinic:
                            break
                    except Exception:
                        pass
            except Exception:
                pass

        if not clinic:
            try:
                await db_session.execute(text('SET search_path TO public;'))
                stmt = select(Clinic).where(Clinic.id == clinic_id)
                clinic = (await db_session.execute(stmt)).scalar_one_or_none()
            except Exception:
                pass
    else:
        stmt = select(Clinic).where(Clinic.id == clinic_id)
        clinic = (await db_session.execute(stmt)).scalar_one_or_none()

    if not clinic:
        raise HTTPException(status_code=404, detail="Clinic not found")
    return clinic


@router.post("/clinics", response_model=ClinicOut, status_code=status.HTTP_201_CREATED)
async def create_clinic(
    payload: ClinicCreate,
    db_session: AsyncSession = Depends(get_db),
    current_user: AdminUser = Depends(require_roles(["SUPER_ADMIN"]))
):
    stmt_t = select(Tenant).where(Tenant.id == payload.tenant_id)
    tenant = (await db_session.execute(stmt_t)).scalar_one_or_none()
    tenant_schema = tenant.schema_name if tenant and getattr(tenant, "schema_name", None) else "public"

    if is_postgres():
        await db_session.execute(text(f'SET search_path TO "{tenant_schema}", public;'))

    clinic = Clinic(
        tenant_id=payload.tenant_id,
        name=payload.name,
        address=payload.address,
        phone=payload.phone,
        timezone=payload.timezone,
        consultation_hours=payload.consultation_hours
    )
    db_session.add(clinic)
    await db_session.flush()
    await db_session.commit()
    if is_postgres():
        await db_session.execute(text(f'SET search_path TO "{tenant_schema}", public;'))
    try:
        await db_session.refresh(clinic)
    except Exception:
        pass
    return clinic


@router.put("/clinics/{clinic_id}", response_model=ClinicOut)
async def update_clinic(
    clinic_id: str,
    payload: ClinicUpdate,
    db_session: AsyncSession = Depends(get_db),
    current_user: AdminUser = Depends(require_roles(["SUPER_ADMIN", "CLINIC_ADMIN"]))
):
    tenant_schema = "public"
    if is_postgres():
        tenant_schema = await resolve_user_tenant_schema(current_user, db_session)
        await db_session.execute(text(f'SET search_path TO "{tenant_schema}", public;'))

    stmt = select(Clinic).where(Clinic.id == clinic_id)
    clinic = (await db_session.execute(stmt)).scalar_one_or_none()
    if not clinic and is_postgres():
        await db_session.execute(text('SET search_path TO public;'))
        clinic = (await db_session.execute(stmt)).scalar_one_or_none()

    if not clinic:
        raise HTTPException(status_code=404, detail="Clinic not found")

    if payload.name is not None:
        clinic.name = payload.name
    if payload.address is not None:
        clinic.address = payload.address
    if payload.phone is not None:
        clinic.phone = payload.phone
    if payload.timezone is not None:
        clinic.timezone = payload.timezone
    if payload.consultation_hours is not None:
        clinic.consultation_hours = payload.consultation_hours
    if payload.whatsapp_phone_number_id is not None:
        clinic.whatsapp_phone_number_id = payload.whatsapp_phone_number_id

    await db_session.flush()
    await db_session.commit()
    if is_postgres():
        await db_session.execute(text(f'SET search_path TO "{tenant_schema}", public;'))
    try:
        await db_session.refresh(clinic)
    except Exception:
        pass
    return clinic


# -----------------------------------------------------------------------------
# Doctor Schema & Multi-Tenant Helpers
# -----------------------------------------------------------------------------
async def resolve_schema_for_clinic(clinic_id: str, db_session: AsyncSession) -> Optional[str]:
    """
    Finds the PostgreSQL schema for a given clinic_id.
    """
    if not clinic_id or not is_postgres():
        return None
    try:
        t_res = await db_session.execute(text("SELECT id, schema_name FROM public.tenants WHERE status='ACTIVE';"))
        tenants = t_res.fetchall()
        for t_id, s_name in tenants:
            if clinic_id == f"clinic_{t_id[:8]}" or clinic_id.startswith(f"clinic_{t_id[:8]}"):
                return sanitize_schema_name(s_name)
        for t_id, s_name in tenants:
            safe = sanitize_schema_name(s_name)
            try:
                async with db_session.begin_nested():
                    await db_session.execute(text(f'SET search_path TO "{safe}", public;'))
                    c_res = await db_session.execute(select(Clinic.id).where(Clinic.id == clinic_id))
                    if c_res.scalar_one_or_none():
                        return safe
            except Exception:
                continue
    except Exception:
        pass
    return None


async def find_doctor_and_schema(
    doctor_id: str,
    db_session: AsyncSession,
    preferred_schema: Optional[str] = None
) -> Tuple[Optional[Doctor], str]:
    """
    Locates a doctor by ID across tenant schemas safely using PostgreSQL savepoints.
    Leaves search_path set to the schema where the doctor was found.
    """
    schemas_to_try: List[str] = []
    if preferred_schema and preferred_schema != "public":
        schemas_to_try.append(sanitize_schema_name(preferred_schema))

    if is_postgres():
        try:
            t_res = await db_session.execute(text("SELECT schema_name FROM public.tenants WHERE status='ACTIVE' ORDER BY created_at ASC;"))
            for (s_name,) in t_res.fetchall():
                safe = sanitize_schema_name(s_name)
                if safe not in schemas_to_try:
                    schemas_to_try.append(safe)
        except Exception:
            pass

    if not schemas_to_try:
        schemas_to_try = ["public"]

    stmt = select(Doctor).where(Doctor.id == doctor_id)

    for s_name in schemas_to_try:
        if is_postgres():
            await db_session.execute(text(f'SET search_path TO "{s_name}", public;'))
        try:
            async with db_session.begin_nested():
                res = await db_session.execute(stmt)
                doc = res.scalar_one_or_none()
                if doc:
                    return doc, s_name
        except Exception:
            continue

    return None, schemas_to_try[0]


# -----------------------------------------------------------------------------
# Doctors Endpoints (Controlled by Granular Permissions: view, create, edit)
# -----------------------------------------------------------------------------
@router.get("/doctors", response_model=List[DoctorOut])
async def list_doctors(
    response: Response,
    clinic_id: Optional[str] = None,
    search: Optional[str] = Query(None, description="Search by doctor name or specialty"),
    specialty: Optional[str] = Query(None, description="Filter by specialty"),
    is_active: Optional[bool] = Query(None, description="Filter by active status"),
    sort_by: Optional[str] = Query(None, description="Column to sort by"),
    sort_dir: Optional[str] = Query("asc", description="asc or desc"),
    page: Optional[int] = Query(None, ge=1),
    page_size: Optional[int] = Query(None, ge=1),
    limit: Optional[int] = None,
    offset: Optional[int] = None,
    current_user: AdminUser = Depends(require_permission("doctors", "view")),
    db_session: AsyncSession = Depends(get_db)
):
    doctors: List[Doctor] = []
    tenant_schema = await resolve_user_tenant_schema(current_user, db_session)
    if clinic_id:
        c_schema = await resolve_schema_for_clinic(clinic_id, db_session)
        if c_schema:
            tenant_schema = c_schema

    safe_schema = sanitize_schema_name(tenant_schema) if tenant_schema and tenant_schema != "public" else None

    if current_user.role != "SUPER_ADMIN" and safe_schema:
        schemas_to_check = [safe_schema]
    else:
        schemas_to_check = [safe_schema] if safe_schema else []
        if is_postgres():
            try:
                t_res = await db_session.execute(text("SELECT schema_name FROM public.tenants WHERE status='ACTIVE' ORDER BY created_at ASC;"))
                for (s_name,) in t_res.fetchall():
                    safe = sanitize_schema_name(s_name)
                    if safe not in schemas_to_check:
                        schemas_to_check.append(safe)
            except Exception:
                pass

    if not schemas_to_check:
        schemas_to_check = ["public"]

    conditions = []
    if clinic_id:
        conditions.append(Doctor.clinic_id == clinic_id)
    if search:
        s = f"%{search}%"
        conditions.append(or_(Doctor.name.ilike(s), Doctor.specialty.ilike(s)))
    if specialty and specialty != 'ALL':
        conditions.append(Doctor.specialty.ilike(f"%{specialty}%"))
    if is_active is not None:
        conditions.append(Doctor.is_active == is_active)

    # Sorting
    is_asc = (sort_dir or "").lower() == "asc"
    if sort_by == "specialty":
        order_clause = asc(Doctor.specialty) if is_asc else desc(Doctor.specialty)
    elif sort_by == "is_active":
        order_clause = asc(Doctor.is_active) if is_asc else desc(Doctor.is_active)
    elif sort_by == "created_at":
        order_clause = asc(Doctor.created_at) if is_asc else desc(Doctor.created_at)
    else:
        order_clause = asc(Doctor.name) if is_asc else desc(Doctor.name)

    # Pagination calculation
    calc_limit: Optional[int] = None
    calc_offset: Optional[int] = None
    if page is not None and page_size is not None:
        calc_limit = page_size
        calc_offset = (page - 1) * page_size
    elif limit is not None:
        calc_limit = limit
        calc_offset = offset or 0

    total_count = 0

    for s_name in schemas_to_check:
        if is_postgres():
            await db_session.execute(text(f'SET search_path TO "{s_name}", public;'))
        try:
            async with db_session.begin_nested():
                # Count total matching records in this schema
                count_stmt = select(func.count(Doctor.id))
                if conditions:
                    count_stmt = count_stmt.where(and_(*conditions))
                c_res = await db_session.execute(count_stmt)
                schema_count = c_res.scalar_one_or_none() or 0
                total_count += schema_count

                # Query data slice
                data_stmt = select(Doctor)
                if conditions:
                    data_stmt = data_stmt.where(and_(*conditions))
                data_stmt = data_stmt.order_by(order_clause)
                if calc_limit is not None:
                    data_stmt = data_stmt.limit(calc_limit)
                if calc_offset is not None:
                    data_stmt = data_stmt.offset(calc_offset)

                res = await db_session.execute(data_stmt)
                for d in res.scalars().all():
                    if not any(existing.id == d.id for existing in doctors):
                        doctors.append(d)
        except Exception:
            continue

    response.headers["X-Total-Count"] = str(total_count)
    return doctors


@router.get("/doctors/{doctor_id}", response_model=DoctorOut)
async def get_doctor(
    doctor_id: str,
    current_user: AdminUser = Depends(require_permission("doctors", "view")),
    db_session: AsyncSession = Depends(get_db)
):
    tenant_schema = await resolve_user_tenant_schema(current_user, db_session)
    doctor, matched_schema = await find_doctor_and_schema(doctor_id, db_session, preferred_schema=tenant_schema)
    if not doctor:
        raise HTTPException(status_code=404, detail="Doctor not found")
    return doctor


@router.post("/doctors", response_model=DoctorOut, status_code=status.HTTP_201_CREATED)
async def create_doctor(
    payload: DoctorCreate,
    current_user: AdminUser = Depends(require_permission("doctors", "create")),
    db_session: AsyncSession = Depends(get_db)
):
    target_schema = None
    if payload.clinic_id:
        target_schema = await resolve_schema_for_clinic(payload.clinic_id, db_session)
    if not target_schema:
        target_schema = await resolve_user_tenant_schema(current_user, db_session)

    safe_target = sanitize_schema_name(target_schema)
    await provision_tenant_schema(safe_target)

    if is_postgres():
        await db_session.execute(text(f'SET search_path TO "{safe_target}", public;'))

    clinic_id = payload.clinic_id or current_user.clinic_id
    if not clinic_id:
        c_res = await db_session.execute(select(Clinic.id).limit(1))
        clinic_id = c_res.scalar_one_or_none() or f"clinic_{safe_target}"

    specialty_val = payload.specialty
    if payload.specialties:
        specialty_val = ", ".join([s.strip() for s in payload.specialties if s.strip()])
    if not specialty_val:
        specialty_val = "General Physician"

    doctor = Doctor(
        clinic_id=clinic_id,
        name=payload.name,
        specialty=specialty_val,
        available_days=payload.available_days or "Mon,Tue,Wed,Thu,Fri,Sat",
        morning_slots=payload.morning_slots.strip() if payload.morning_slots and payload.morning_slots.strip() else "09:00 AM,09:30 AM,10:00 AM,10:30 AM,11:00 AM,11:30 AM,12:00 PM,12:30 PM",
        evening_slots=payload.evening_slots.strip() if payload.evening_slots and payload.evening_slots.strip() else "04:00 PM,04:30 PM,05:00 PM,05:30 PM,06:00 PM,06:30 PM,07:00 PM",
        slot_duration_minutes=payload.slot_duration_minutes or 15,
        is_active=payload.is_active if payload.is_active is not None else True
    )
    db_session.add(doctor)
    await db_session.flush()
    await db_session.commit()
    if is_postgres():
        await db_session.execute(text(f'SET search_path TO "{safe_target}", public;'))
    await db_session.refresh(doctor)
    return doctor


@router.put("/doctors/{doctor_id}", response_model=DoctorOut)
async def update_doctor(
    doctor_id: str,
    payload: DoctorUpdate,
    current_user: AdminUser = Depends(require_permission("doctors", "edit")),
    db_session: AsyncSession = Depends(get_db)
):
    tenant_schema = await resolve_user_tenant_schema(current_user, db_session)
    doctor, matched_schema = await find_doctor_and_schema(doctor_id, db_session, preferred_schema=tenant_schema)

    if not doctor:
        raise HTTPException(status_code=404, detail="Doctor not found")

    if is_postgres():
        await db_session.execute(text(f'SET search_path TO "{matched_schema}", public;'))

    if payload.name is not None:
        doctor.name = payload.name
    if payload.specialties is not None:
        doctor.specialty = ", ".join([s.strip() for s in payload.specialties if s.strip()])
    elif payload.specialty is not None:
        doctor.specialty = payload.specialty
    if payload.available_days is not None:
        doctor.available_days = payload.available_days
    if payload.morning_slots is not None:
        doctor.morning_slots = payload.morning_slots
    if payload.evening_slots is not None:
        doctor.evening_slots = payload.evening_slots
    if payload.slot_duration_minutes is not None:
        doctor.slot_duration_minutes = payload.slot_duration_minutes
    if payload.is_active is not None:
        doctor.is_active = payload.is_active

    await db_session.flush()
    await db_session.commit()
    if is_postgres():
        await db_session.execute(text(f'SET search_path TO "{matched_schema}", public;'))
    await db_session.refresh(doctor)
    return doctor


@router.patch("/doctors/{doctor_id}/status", response_model=DoctorOut)
async def toggle_doctor_status(
    doctor_id: str,
    payload: DoctorStatusUpdate,
    current_user: AdminUser = Depends(require_permission("doctors", "edit")),
    db_session: AsyncSession = Depends(get_db)
):
    tenant_schema = await resolve_user_tenant_schema(current_user, db_session)
    doctor, matched_schema = await find_doctor_and_schema(doctor_id, db_session, preferred_schema=tenant_schema)

    if not doctor:
        raise HTTPException(status_code=404, detail="Doctor not found")

    if is_postgres():
        await db_session.execute(text(f'SET search_path TO "{matched_schema}", public;'))

    doctor.is_active = payload.is_active
    await db_session.flush()
    await db_session.commit()
    if is_postgres():
        await db_session.execute(text(f'SET search_path TO "{matched_schema}", public;'))
    await db_session.refresh(doctor)
    return doctor


@router.delete("/doctors/{doctor_id}", status_code=status.HTTP_200_OK)
async def delete_doctor(
    doctor_id: str,
    current_user: AdminUser = Depends(require_permission("doctors", "delete")),
    db_session: AsyncSession = Depends(get_db)
):
    tenant_schema = await resolve_user_tenant_schema(current_user, db_session)
    doctor, matched_schema = await find_doctor_and_schema(doctor_id, db_session, preferred_schema=tenant_schema)

    if not doctor:
        raise HTTPException(status_code=404, detail="Doctor not found")

    if is_postgres():
        await db_session.execute(text(f'SET search_path TO "{matched_schema}", public;'))

    await db_session.delete(doctor)
    await db_session.commit()
    return {"message": "Doctor deleted successfully", "id": doctor_id}


# -----------------------------------------------------------------------------
# Patients Endpoints (Controlled by Granular Permissions: view, create, edit, delete)
# -----------------------------------------------------------------------------
@router.get("/patients", response_model=List[PatientOut])
async def list_patients(
    response: Response,
    search: Optional[str] = Query(None, description="Search by patient name, phone, or email"),
    status_filter: Optional[str] = Query(None, description="ACTIVE, INACTIVE, ALL"),
    sort_by: Optional[str] = Query(None, description="Column to sort by"),
    sort_dir: Optional[str] = Query("asc", description="asc or desc"),
    page: Optional[int] = Query(None, ge=1),
    page_size: Optional[int] = Query(None, ge=1),
    limit: Optional[int] = None,
    offset: Optional[int] = None,
    current_user: AdminUser = Depends(require_permission("patients", "view")),
    db_session: AsyncSession = Depends(get_db)
):
    tenant_schema = await resolve_user_tenant_schema(current_user, db_session)
    if not tenant_schema or tenant_schema == "public":
        tenant_schema = "clinic_default"

    safe_schema = sanitize_schema_name(tenant_schema)

    if is_postgres():
        await db_session.execute(text(f'SET search_path TO "{safe_schema}", public;'))

    conditions = []
    if search:
        s = f"%{search}%"
        conditions.append(or_(Patient.full_name.ilike(s), Patient.mobile_number.ilike(s), Patient.email.ilike(s)))
    if status_filter and status_filter != 'ALL':
        conditions.append(Patient.status == status_filter.upper())

    # Sorting
    is_asc = (sort_dir or "").lower() == "asc"
    if sort_by == "mobile_number":
        order_clause = asc(Patient.mobile_number) if is_asc else desc(Patient.mobile_number)
    elif sort_by == "status":
        order_clause = asc(Patient.status) if is_asc else desc(Patient.status)
    elif sort_by == "created_at":
        order_clause = asc(Patient.created_at) if is_asc else desc(Patient.created_at)
    else:
        order_clause = asc(Patient.full_name) if is_asc else desc(Patient.full_name)

    # Pagination calculation
    calc_limit: Optional[int] = None
    calc_offset: Optional[int] = None
    if page is not None and page_size is not None:
        calc_limit = page_size
        calc_offset = (page - 1) * page_size
    elif limit is not None:
        calc_limit = limit
        calc_offset = offset or 0

    try:
        # Count total
        count_stmt = select(func.count(Patient.id))
        if conditions:
            count_stmt = count_stmt.where(and_(*conditions))
        c_res = await db_session.execute(count_stmt)
        total_count = c_res.scalar_one_or_none() or 0
        response.headers["X-Total-Count"] = str(total_count)

        stmt = select(Patient)
        if conditions:
            stmt = stmt.where(and_(*conditions))
        stmt = stmt.order_by(order_clause)
        if calc_limit is not None:
            stmt = stmt.limit(calc_limit)
        if calc_offset is not None:
            stmt = stmt.offset(calc_offset)

        result = await db_session.execute(stmt)
        return result.scalars().all()
    except Exception as e:
        logger.warning(f"Error reading patients in schema '{safe_schema}': {e}. Falling back to public.")
        if is_postgres():
            try:
                await db_session.rollback()
                await db_session.execute(text('SET search_path TO public;'))

                count_stmt = select(func.count(Patient.id))
                if conditions:
                    count_stmt = count_stmt.where(and_(*conditions))
                c_res = await db_session.execute(count_stmt)
                total_count = c_res.scalar_one_or_none() or 0
                response.headers["X-Total-Count"] = str(total_count)

                stmt = select(Patient)
                if conditions:
                    stmt = stmt.where(and_(*conditions))
                stmt = stmt.order_by(order_clause)
                if calc_limit is not None:
                    stmt = stmt.limit(calc_limit)
                if calc_offset is not None:
                    stmt = stmt.offset(calc_offset)

                res = await db_session.execute(stmt)
                return res.scalars().all()
            except Exception as e2:
                logger.error(f"Fallback patient query failed: {e2}")
                response.headers["X-Total-Count"] = "0"
                return []
        response.headers["X-Total-Count"] = "0"
        return []


@router.get("/patients/{patient_id}", response_model=PatientOut)
async def get_patient(
    patient_id: str,
    current_user: AdminUser = Depends(require_permission("patients", "view")),
    db_session: AsyncSession = Depends(get_db)
):
    tenant_schema = await resolve_user_tenant_schema(current_user, db_session)
    if is_postgres():
        await db_session.execute(text(f'SET search_path TO "{tenant_schema}", public;'))

    stmt = select(Patient).where(Patient.id == patient_id)
    patient = (await db_session.execute(stmt)).scalar_one_or_none()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")
    return patient


@router.post("/patients", response_model=PatientOut, status_code=status.HTTP_201_CREATED)
async def create_patient(
    payload: PatientCreate,
    current_user: AdminUser = Depends(require_permission("patients", "create")),
    db_session: AsyncSession = Depends(get_db)
):
    tenant_schema = await resolve_user_tenant_schema(current_user, db_session)
    if is_postgres():
        await db_session.execute(text(f'SET search_path TO "{tenant_schema}", public;'))

    patient = Patient(
        full_name=payload.full_name.strip(),
        mobile_number=payload.mobile_number.strip(),
        email=payload.email.strip() if payload.email else None,
        gender=payload.gender,
        age=payload.age,
        address=payload.address.strip() if payload.address else None,
        status=payload.status,
        is_active=payload.is_active
    )
    db_session.add(patient)
    await db_session.flush()
    await db_session.commit()
    if is_postgres():
        await db_session.execute(text(f'SET search_path TO "{tenant_schema}", public;'))
    try:
        await db_session.refresh(patient)
    except Exception:
        pass
    return patient


@router.put("/patients/{patient_id}", response_model=PatientOut)
async def update_patient(
    patient_id: str,
    payload: PatientUpdate,
    current_user: AdminUser = Depends(require_permission("patients", "edit")),
    db_session: AsyncSession = Depends(get_db)
):
    tenant_schema = await resolve_user_tenant_schema(current_user, db_session)
    if is_postgres():
        await db_session.execute(text(f'SET search_path TO "{tenant_schema}", public;'))

    stmt = select(Patient).where(Patient.id == patient_id)
    patient = (await db_session.execute(stmt)).scalar_one_or_none()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")

    if payload.full_name is not None:
        patient.full_name = payload.full_name.strip()
    if payload.mobile_number is not None:
        patient.mobile_number = payload.mobile_number.strip()
    if payload.email is not None:
        patient.email = payload.email.strip() if payload.email else None
    if payload.gender is not None:
        patient.gender = payload.gender
    if payload.age is not None:
        patient.age = payload.age
    if payload.address is not None:
        patient.address = payload.address.strip() if payload.address else None
    if payload.status is not None:
        patient.status = payload.status
    if payload.is_active is not None:
        patient.is_active = payload.is_active

    await db_session.flush()
    await db_session.commit()
    if is_postgres():
        await db_session.execute(text(f'SET search_path TO "{tenant_schema}", public;'))
    try:
        await db_session.refresh(patient)
    except Exception:
        pass
    return patient


@router.patch("/patients/{patient_id}/status", response_model=PatientOut)
async def toggle_patient_status(
    patient_id: str,
    payload: PatientStatusUpdate,
    current_user: AdminUser = Depends(require_permission("patients", "edit")),
    db_session: AsyncSession = Depends(get_db)
):
    tenant_schema = await resolve_user_tenant_schema(current_user, db_session)
    if is_postgres():
        await db_session.execute(text(f'SET search_path TO "{tenant_schema}", public;'))

    stmt = select(Patient).where(Patient.id == patient_id)
    patient = (await db_session.execute(stmt)).scalar_one_or_none()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")

    patient.is_active = payload.is_active
    patient.status = "ACTIVE" if payload.is_active else "INACTIVE"
    await db_session.flush()
    await db_session.commit()
    if is_postgres():
        await db_session.execute(text(f'SET search_path TO "{tenant_schema}", public;'))
    try:
        await db_session.refresh(patient)
    except Exception:
        pass
    return patient


@router.delete("/patients/{patient_id}", status_code=status.HTTP_200_OK)
async def delete_patient(
    patient_id: str,
    current_user: AdminUser = Depends(require_permission("patients", "delete")),
    db_session: AsyncSession = Depends(get_db)
):
    tenant_schema = await resolve_user_tenant_schema(current_user, db_session)
    if is_postgres():
        await db_session.execute(text(f'SET search_path TO "{tenant_schema}", public;'))

    stmt = select(Patient).where(Patient.id == patient_id)
    patient = (await db_session.execute(stmt)).scalar_one_or_none()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")

    await db_session.delete(patient)
    await db_session.commit()
    return {"message": "Patient deleted successfully", "id": patient_id}


# -----------------------------------------------------------------------------
# WhatsApp API Configuration Endpoints
# -----------------------------------------------------------------------------
@router.get("/whatsapp/config", response_model=WhatsAppConfigOut)
async def get_whatsapp_config(
    current_user: AdminUser = Depends(require_roles(["SUPER_ADMIN", "CLINIC_ADMIN"])),
    db_session: AsyncSession = Depends(get_db)
):
    tenant_schema = await resolve_user_tenant_schema(current_user, db_session)
    if is_postgres():
        await db_session.execute(text(f'SET search_path TO "{tenant_schema}", public;'))

    stmt = select(Clinic).limit(1)
    clinic = (await db_session.execute(stmt)).scalar_one_or_none()
    if not clinic:
        raise HTTPException(status_code=404, detail="Clinic profile not found")

    default_bot_config = {
        "enable_doctor_selection": True,
        "default_doctor_id": None,
        "welcome_message": f"Hello! 👋 Welcome to *{clinic.name}*. Please let us know which doctor or specialization you wish to consult.",
        "reminder_lead_time_minutes": 60,
        "enable_ai_bot": True
    }

    eff_phone_id = (clinic.whatsapp_phone_number_id or "").strip() or (settings.WHATSAPP_PHONE_NUMBER_ID or "").strip()
    eff_waba_id = (clinic.whatsapp_business_account_id or "").strip() or (settings.WHATSAPP_BUSINESS_ACCOUNT_ID or "").strip()
    eff_token = (clinic.whatsapp_access_token or "").strip() or (settings.WHATSAPP_ACCESS_TOKEN or "").strip()
    eff_verify_token = (clinic.whatsapp_verify_token or "").strip() or (settings.WHATSAPP_VERIFY_TOKEN or "siddhi_patient_assistant_verify_token_secure_2026").strip()

    is_live = bool(eff_phone_id and eff_token and not eff_phone_id.startswith("12345"))

    return WhatsAppConfigOut(
        clinic_id=clinic.id,
        clinic_name=clinic.name,
        whatsapp_phone_number_id=eff_phone_id or None,
        whatsapp_business_account_id=eff_waba_id or None,
        whatsapp_access_token=eff_token or None,
        whatsapp_verify_token=eff_verify_token or None,
        bot_config=clinic.bot_config or default_bot_config,
        is_live=is_live
    )


@router.post("/whatsapp/config", response_model=WhatsAppConfigOut)
async def update_whatsapp_config(
    payload: WhatsAppConfigUpdate,
    current_user: AdminUser = Depends(require_roles(["SUPER_ADMIN"])),
    db_session: AsyncSession = Depends(get_db)
):
    tenant_schema = await resolve_user_tenant_schema(current_user, db_session)
    if is_postgres():
        await db_session.execute(text(f'SET search_path TO "{tenant_schema}", public;'))

    stmt = select(Clinic).limit(1)
    clinic = (await db_session.execute(stmt)).scalar_one_or_none()
    if not clinic:
        raise HTTPException(status_code=404, detail="Clinic profile not found")

    if payload.whatsapp_phone_number_id is not None:
        clinic.whatsapp_phone_number_id = payload.whatsapp_phone_number_id.strip()
    if payload.whatsapp_business_account_id is not None:
        clinic.whatsapp_business_account_id = payload.whatsapp_business_account_id.strip()
    if payload.whatsapp_access_token is not None:
        clinic.whatsapp_access_token = payload.whatsapp_access_token.strip()
    if payload.whatsapp_verify_token is not None:
        clinic.whatsapp_verify_token = payload.whatsapp_verify_token.strip()
    if payload.bot_config is not None:
        clinic.bot_config = payload.bot_config

    await db_session.flush()
    await db_session.commit()
    if is_postgres():
        await db_session.execute(text(f'SET search_path TO "{tenant_schema}", public;'))
    try:
        await db_session.refresh(clinic)
    except Exception:
        pass

    eff_phone_id = (clinic.whatsapp_phone_number_id or "").strip() or (settings.WHATSAPP_PHONE_NUMBER_ID or "").strip()
    eff_waba_id = (clinic.whatsapp_business_account_id or "").strip() or (settings.WHATSAPP_BUSINESS_ACCOUNT_ID or "").strip()
    eff_token = (clinic.whatsapp_access_token or "").strip() or (settings.WHATSAPP_ACCESS_TOKEN or "").strip()
    eff_verify_token = (clinic.whatsapp_verify_token or "").strip() or (settings.WHATSAPP_VERIFY_TOKEN or "siddhi_patient_assistant_verify_token_secure_2026").strip()
    is_live = bool(eff_phone_id and eff_token and not eff_phone_id.startswith("12345"))

    return WhatsAppConfigOut(
        clinic_id=clinic.id,
        clinic_name=clinic.name,
        whatsapp_phone_number_id=eff_phone_id or None,
        whatsapp_business_account_id=eff_waba_id or None,
        whatsapp_access_token=eff_token or None,
        whatsapp_verify_token=eff_verify_token or None,
        bot_config=clinic.bot_config,
        is_live=is_live
    )


@router.post("/whatsapp/test")
async def test_whatsapp_connection(
    payload: WhatsAppTestRequest,
    current_user: AdminUser = Depends(require_roles(["SUPER_ADMIN"])),
    db_session: AsyncSession = Depends(get_db)
):
    tenant_schema = await resolve_user_tenant_schema(current_user, db_session)
    if is_postgres():
        await db_session.execute(text(f'SET search_path TO "{tenant_schema}", public;'))

    stmt = select(Clinic).limit(1)
    clinic = (await db_session.execute(stmt)).scalar_one_or_none()

    eff_phone_id = (clinic.whatsapp_phone_number_id if clinic and clinic.whatsapp_phone_number_id else None) or settings.WHATSAPP_PHONE_NUMBER_ID
    eff_token = (clinic.whatsapp_access_token if clinic and clinic.whatsapp_access_token else None) or settings.WHATSAPP_ACCESS_TOKEN

    from app.services.whatsapp_service import WhatsAppService
    wa_svc = WhatsAppService(phone_number_id=eff_phone_id, access_token=eff_token)

    now_str = datetime.now().strftime("%Y-%m-%d %I:%M %p")
    clinic_name = clinic.name if clinic else "Clinic"
    test_msg = (
        f"✅ *WhatsApp API Test Successful!*\n\n"
        f"Connected to *Siddhi Patient-Doctor Assistant* for *{clinic_name}*.\n"
        f"• *Authorized Staff:* {current_user.full_name}\n"
        f"• *Timestamp:* {now_str}\n\n"
        f"Your Meta WhatsApp Cloud API credentials are live and ready for patient booking interactions."
    )

    if payload.use_template:
        success = await wa_svc.send_hello_world_template(
            payload.test_mobile_number.strip()
        )
        dispatch_type = "Pre-approved Template ('hello_world')"
    else:
        success = await wa_svc.send_text_message(
            payload.test_mobile_number.strip(),
            test_msg
        )
        dispatch_type = "Standard Text Message"

    if success:
        is_simulated = not wa_svc._is_configured()
        msg_text = (
            f"Live test {dispatch_type} dispatched successfully via Meta WhatsApp Cloud API!"
            if not is_simulated else
            f"Message processed successfully in Simulated/Sandbox mode."
        )
        if not is_simulated and not payload.use_template:
            msg_text += (
                " NOTE: Free-form text messages require the patient to have messaged the business within the last 24 hours. "
                "If not received on WhatsApp, send 'Hi' from your mobile phone to the clinic's WhatsApp number to open the 24-hour window, or select the 'hello_world' template option."
            )
        return {
            "status": "SUCCESS",
            "mobile_number": payload.test_mobile_number,
            "is_live": not is_simulated,
            "message": msg_text
        }
    else:
        err_detail = wa_svc.last_error or "Could not dispatch message. Verify Phone Number ID, Access Token, and recipient phone number."
        return {
            "status": "FAILED",
            "mobile_number": payload.test_mobile_number,
            "is_live": False,
            "message": f"Message delivery failed: {err_detail}"
        }


@router.post("/whatsapp/subscribe-waba")
async def subscribe_waba_endpoint(
    current_user: AdminUser = Depends(require_roles(["SUPER_ADMIN", "CLINIC_ADMIN"])),
    db_session: AsyncSession = Depends(get_db)
):
    """
    Subscribes the WhatsApp Business Account (WABA) to the app's webhooks.
    Required by Meta to receive live inbound messages from patients and delivery status updates.
    """
    tenant_schema = await resolve_user_tenant_schema(current_user, db_session)
    if is_postgres():
        await db_session.execute(text(f'SET search_path TO "{tenant_schema}", public;'))

    stmt = select(Clinic).limit(1)
    clinic = (await db_session.execute(stmt)).scalar_one_or_none()

    eff_waba_id = (clinic.whatsapp_business_account_id if clinic and clinic.whatsapp_business_account_id else None) or settings.WHATSAPP_BUSINESS_ACCOUNT_ID
    eff_token = (clinic.whatsapp_access_token if clinic and clinic.whatsapp_access_token else None) or settings.WHATSAPP_ACCESS_TOKEN

    from app.services.whatsapp_service import WhatsAppService
    wa_svc = WhatsAppService(access_token=eff_token)
    res = await wa_svc.subscribe_waba(waba_id=eff_waba_id, access_token=eff_token)
    return res


# -----------------------------------------------------------------------------
# Specializations Master Endpoints (Global Master Catalog for Clinics & Doctors)
# -----------------------------------------------------------------------------
@router.get("/specializations", response_model=List[SpecializationOut])
async def list_specializations(
    response: Response,
    search: Optional[str] = Query(None, description="Search by specialization name or description"),
    is_active: Optional[bool] = Query(None, description="Filter active status"),
    sort_by: Optional[str] = Query(None, description="Column to sort by"),
    sort_dir: Optional[str] = Query("asc", description="asc or desc"),
    page: Optional[int] = Query(None, ge=1),
    page_size: Optional[int] = Query(None, ge=1),
    limit: Optional[int] = None,
    offset: Optional[int] = None,
    db_session: AsyncSession = Depends(get_db),
    current_user: Optional[AdminUser] = Depends(get_optional_admin)
):
    if is_postgres():
        await db_session.execute(text('SET search_path TO public;'))

    stmt = select(Specialization)
    conditions = []
    if search:
        s = f"%{search}%"
        conditions.append(or_(Specialization.name.ilike(s), Specialization.description.ilike(s)))
    if is_active is not None:
        conditions.append(Specialization.is_active == is_active)

    if conditions:
        stmt = stmt.where(and_(*conditions))

    # Count total
    count_stmt = select(func.count(Specialization.id))
    if conditions:
        count_stmt = count_stmt.where(and_(*conditions))
    c_res = await db_session.execute(count_stmt)
    total_count = c_res.scalar_one_or_none() or 0
    response.headers["X-Total-Count"] = str(total_count)

    # Sorting
    is_asc = (sort_dir or "").lower() == "asc"
    if sort_by == "is_active":
        stmt = stmt.order_by(asc(Specialization.is_active) if is_asc else desc(Specialization.is_active))
    elif sort_by == "created_at":
        stmt = stmt.order_by(asc(Specialization.created_at) if is_asc else desc(Specialization.created_at))
    else:
        stmt = stmt.order_by(asc(Specialization.name) if is_asc else desc(Specialization.name))

    # Pagination
    if page is not None and page_size is not None:
        stmt = stmt.limit(page_size).offset((page - 1) * page_size)
    elif limit is not None:
        stmt = stmt.limit(limit).offset(offset or 0)

    result = await db_session.execute(stmt)
    return result.scalars().all()


@router.get("/specializations/{spec_id}", response_model=SpecializationOut)
async def get_specialization(
    spec_id: str,
    db_session: AsyncSession = Depends(get_db),
    current_user: Optional[AdminUser] = Depends(get_optional_admin)
):
    if is_postgres():
        await db_session.execute(text('SET search_path TO public;'))

    stmt = select(Specialization).where(Specialization.id == spec_id)
    spec = (await db_session.execute(stmt)).scalar_one_or_none()
    if not spec:
        raise HTTPException(status_code=404, detail="Specialization not found")
    return spec


@router.post("/specializations", response_model=SpecializationOut, status_code=status.HTTP_201_CREATED)
async def create_specialization(
    payload: SpecializationCreate,
    db_session: AsyncSession = Depends(get_db),
    current_user: AdminUser = Depends(require_roles(["SUPER_ADMIN", "CLINIC_ADMIN"]))
):
    if is_postgres():
        await db_session.execute(text('SET search_path TO public;'))

    stmt = select(Specialization).where(Specialization.name.ilike(payload.name.strip()))
    existing = (await db_session.execute(stmt)).scalar_one_or_none()
    if existing:
        raise HTTPException(status_code=400, detail="Specialization with this name already exists")

    spec = Specialization(
        name=payload.name.strip(),
        description=payload.description.strip() if payload.description else None,
        is_active=payload.is_active
    )
    db_session.add(spec)
    await db_session.flush()
    await db_session.commit()
    if is_postgres():
        await db_session.execute(text('SET search_path TO public;'))
    try:
        await db_session.refresh(spec)
    except Exception:
        pass
    return spec


@router.put("/specializations/{spec_id}", response_model=SpecializationOut)
async def update_specialization(
    spec_id: str,
    payload: SpecializationUpdate,
    db_session: AsyncSession = Depends(get_db),
    current_user: AdminUser = Depends(require_roles(["SUPER_ADMIN", "CLINIC_ADMIN"]))
):
    if is_postgres():
        await db_session.execute(text('SET search_path TO public;'))

    stmt = select(Specialization).where(Specialization.id == spec_id)
    spec = (await db_session.execute(stmt)).scalar_one_or_none()
    if not spec:
        raise HTTPException(status_code=404, detail="Specialization not found")

    if payload.name is not None and payload.name.strip():
        # Check duplicate
        stmt_dup = select(Specialization).where(
            Specialization.name.ilike(payload.name.strip()),
            Specialization.id != spec_id
        )
        dup = (await db_session.execute(stmt_dup)).scalar_one_or_none()
        if dup:
            raise HTTPException(status_code=400, detail="Specialization with this name already exists")
        spec.name = payload.name.strip()

    if payload.description is not None:
        spec.description = payload.description.strip() if payload.description else None
    if payload.is_active is not None:
        spec.is_active = payload.is_active

    await db_session.flush()
    await db_session.commit()
    if is_postgres():
        await db_session.execute(text('SET search_path TO public;'))
    try:
        await db_session.refresh(spec)
    except Exception:
        pass
    return spec


@router.patch("/specializations/{spec_id}/status", response_model=SpecializationOut)
async def toggle_specialization_status(
    spec_id: str,
    payload: SpecializationStatusUpdate,
    db_session: AsyncSession = Depends(get_db),
    current_user: AdminUser = Depends(require_roles(["SUPER_ADMIN", "CLINIC_ADMIN"]))
):
    if is_postgres():
        await db_session.execute(text('SET search_path TO public;'))

    stmt = select(Specialization).where(Specialization.id == spec_id)
    spec = (await db_session.execute(stmt)).scalar_one_or_none()
    if not spec:
        raise HTTPException(status_code=404, detail="Specialization not found")

    spec.is_active = payload.is_active
    await db_session.flush()
    await db_session.commit()
    if is_postgres():
        await db_session.execute(text('SET search_path TO public;'))
    try:
        await db_session.refresh(spec)
    except Exception:
        pass
    return spec


@router.delete("/specializations/{spec_id}", status_code=status.HTTP_200_OK)
async def delete_specialization(
    spec_id: str,
    db_session: AsyncSession = Depends(get_db),
    current_user: AdminUser = Depends(require_roles(["SUPER_ADMIN", "CLINIC_ADMIN"]))
):
    if is_postgres():
        await db_session.execute(text('SET search_path TO public;'))

    stmt = select(Specialization).where(Specialization.id == spec_id)
    spec = (await db_session.execute(stmt)).scalar_one_or_none()
    if not spec:
        raise HTTPException(status_code=404, detail="Specialization not found")

    await db_session.delete(spec)
    await db_session.commit()
    return {"message": "Specialization deleted successfully", "id": spec_id}


# -----------------------------------------------------------------------------
# Webhook Events Auditing & Debugging Endpoints (SUPER_ADMIN Only)
# -----------------------------------------------------------------------------
@router.get("/webhook-events", response_model=List[WebhookEventOut])
async def list_webhook_events(
    response: Response,
    search: Optional[str] = Query(None, description="Search by sender phone, message body, or message id"),
    status: Optional[str] = Query(None, description="Filter by event status"),
    event_type: Optional[str] = Query(None, description="Filter by event type"),
    sort_by: Optional[str] = Query("created_at", description="Field to sort by"),
    sort_dir: Optional[str] = Query("desc", description="Sort direction (asc or desc)"),
    page: Optional[int] = Query(1, ge=1),
    page_size: Optional[int] = Query(10, ge=1, le=100),
    db_session: AsyncSession = Depends(get_db),
    current_user: AdminUser = Depends(require_roles(["SUPER_ADMIN"]))
):
    """
    Returns server-side paginated, sorted, and filtered incoming webhook events.
    Restricted strictly to SUPER_ADMIN role.
    """
    if is_postgres():
        await db_session.execute(text('SET search_path TO public;'))

    stmt = select(WebhookEvent)

    # 1. Search filter
    if search and search.strip():
        term = f"%{search.strip()}%"
        stmt = stmt.where(
            or_(
                WebhookEvent.sender_phone.ilike(term),
                WebhookEvent.message_body.ilike(term),
                WebhookEvent.message_id.ilike(term),
                WebhookEvent.event_type.ilike(term),
                WebhookEvent.status.ilike(term),
            )
        )

    # 2. Status filter
    if status and status.strip():
        stmt = stmt.where(WebhookEvent.status == status.strip())

    # 3. Event Type filter
    if event_type and event_type.strip():
        stmt = stmt.where(WebhookEvent.event_type.ilike(f"%{event_type.strip()}%"))

    # 4. Total Count
    count_stmt = select(func.count()).select_from(stmt.subquery())
    total_count = (await db_session.execute(count_stmt)).scalar() or 0
    response.headers["X-Total-Count"] = str(total_count)
    response.headers["Access-Control-Expose-Headers"] = "X-Total-Count, x-total-count"

    # 5. Sorting
    sort_column = getattr(WebhookEvent, sort_by, WebhookEvent.created_at)
    if sort_dir and sort_dir.lower() == "asc":
        stmt = stmt.order_by(asc(sort_column))
    else:
        stmt = stmt.order_by(desc(sort_column))

    # 6. Pagination
    eff_page = page or 1
    eff_size = page_size or 10
    offset = (eff_page - 1) * eff_size
    stmt = stmt.offset(offset).limit(eff_size)

    result = await db_session.execute(stmt)
    events = result.scalars().all()
    return events


@router.get("/webhook-events/{event_id}", response_model=WebhookEventOut)
async def get_webhook_event(
    event_id: str,
    db_session: AsyncSession = Depends(get_db),
    current_user: AdminUser = Depends(require_roles(["SUPER_ADMIN"]))
):
    if is_postgres():
        await db_session.execute(text('SET search_path TO public;'))

    stmt = select(WebhookEvent).where(WebhookEvent.id == event_id)
    event = (await db_session.execute(stmt)).scalar_one_or_none()
    if not event:
        raise HTTPException(status_code=404, detail="Webhook event not found")
    return event


@router.delete("/webhook-events/{event_id}", status_code=status.HTTP_200_OK)
async def delete_webhook_event(
    event_id: str,
    db_session: AsyncSession = Depends(get_db),
    current_user: AdminUser = Depends(require_roles(["SUPER_ADMIN"]))
):
    if is_postgres():
        await db_session.execute(text('SET search_path TO public;'))

    stmt = select(WebhookEvent).where(WebhookEvent.id == event_id)
    event = (await db_session.execute(stmt)).scalar_one_or_none()
    if not event:
        raise HTTPException(status_code=404, detail="Webhook event not found")

    await db_session.delete(event)
    await db_session.commit()
    return {"message": "Webhook event deleted successfully", "id": event_id}


@router.delete("/webhook-events", status_code=status.HTTP_200_OK)
async def purge_webhook_events(
    db_session: AsyncSession = Depends(get_db),
    current_user: AdminUser = Depends(require_roles(["SUPER_ADMIN"]))
):
    if is_postgres():
        await db_session.execute(text('SET search_path TO public;'))

    await db_session.execute(text("DELETE FROM public.webhook_events;"))
    await db_session.commit()
    return {"message": "All webhook events purged successfully"}
