import logging
import json
from typing import List, Dict, Any, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.config import settings
from app.core.database import get_db, sanitize_schema_name, provision_tenant_schema, is_postgres
from app.core.security import get_password_hash
from app.models.domain import Tenant, Clinic, Doctor, Patient, Appointment, AdminUser, Specialization, get_default_permissions
from app.models.schemas import (
    DoctorOut, DoctorCreate, DoctorUpdate, DoctorStatusUpdate,
    ClinicOut, ClinicCreate, ClinicUpdate,
    PatientOut, PatientCreate, PatientUpdate, PatientStatusUpdate,
    TenantOut, TenantCreate, TenantUpdate,
    AdminUserOut, AdminUserCreate, AdminUserUpdate,
    SpecializationOut, SpecializationCreate, SpecializationUpdate, SpecializationStatusUpdate,
    WhatsAppConfigOut, WhatsAppConfigUpdate, WhatsAppTestRequest
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
    db_session: AsyncSession = Depends(get_db),
    current_user: AdminUser = Depends(require_roles(["SUPER_ADMIN"]))
):
    stmt = select(Tenant)
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
    await db_session.commit()
    await db_session.refresh(tenant)

    # 1. Automatically provision initial clinic profile inside the new tenant schema
    clinic_id = f"clinic_{tenant.id[:8]}"
    clinic = Clinic(
        id=clinic_id,
        tenant_id=tenant.id,
        name=payload.name,
        address="Suite 101, Medical Health Center",
        phone=payload.owner_phone or "+91 98765 00000",
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

    await db_session.commit()
    await db_session.refresh(tenant)
    return tenant


# -----------------------------------------------------------------------------
# User Management (SUPER_ADMIN for all, CLINIC_ADMIN for Front Desk staff)
# Clinic Admin manages Front Desk users and assigns Screen & Action Permissions
# -----------------------------------------------------------------------------
@router.get("/users", response_model=List[AdminUserOut])
async def list_users(
    tenant_id: Optional[str] = None,
    db_session: AsyncSession = Depends(get_db),
    current_user: AdminUser = Depends(require_roles(["SUPER_ADMIN", "CLINIC_ADMIN"]))
):
    stmt = select(AdminUser)
    if current_user.role == "CLINIC_ADMIN":
        # Clinic admin only sees staff under their clinic tenant
        stmt = stmt.where(AdminUser.tenant_id == current_user.tenant_id)
    elif tenant_id:
        stmt = stmt.where(AdminUser.tenant_id == tenant_id)

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

    await db_session.commit()
    await db_session.refresh(user)

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
    await db_session.commit()
    await db_session.refresh(clinic)
    return clinic


@router.put("/clinics/{clinic_id}", response_model=ClinicOut)
async def update_clinic(
    clinic_id: str,
    payload: ClinicUpdate,
    db_session: AsyncSession = Depends(get_db),
    current_user: AdminUser = Depends(require_roles(["SUPER_ADMIN", "CLINIC_ADMIN"]))
):
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

    await db_session.commit()
    await db_session.refresh(clinic)
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
    clinic_id: Optional[str] = None,
    current_user: AdminUser = Depends(require_permission("doctors", "view")),
    db_session: AsyncSession = Depends(get_db)
):
    doctors: List[Doctor] = []
    tenant_schema = await resolve_user_tenant_schema(current_user, db_session)
    if clinic_id:
        c_schema = await resolve_schema_for_clinic(clinic_id, db_session)
        if c_schema:
            tenant_schema = c_schema

    schemas_to_check = [tenant_schema] if tenant_schema and tenant_schema != "public" else []
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

    stmt = select(Doctor)
    if clinic_id:
        stmt = stmt.where(Doctor.clinic_id == clinic_id)

    for s_name in schemas_to_check:
        if is_postgres():
            await db_session.execute(text(f'SET search_path TO "{s_name}", public;'))
        try:
            async with db_session.begin_nested():
                res = await db_session.execute(stmt)
                for d in res.scalars().all():
                    if not any(existing.id == d.id for existing in doctors):
                        doctors.append(d)
        except Exception:
            continue

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
    search: Optional[str] = None,
    status_filter: Optional[str] = None,
    limit: int = 100,
    offset: int = 0,
    current_user: AdminUser = Depends(require_permission("patients", "view")),
    db_session: AsyncSession = Depends(get_db)
):
    tenant_schema = await resolve_user_tenant_schema(current_user, db_session)
    if not tenant_schema or tenant_schema == "public":
        tenant_schema = "clinic_default"

    if is_postgres():
        await db_session.execute(text(f'SET search_path TO "{tenant_schema}", public;'))

    try:
        stmt = select(Patient)
        if search:
            stmt = stmt.where(Patient.full_name.ilike(f"%{search}%") | Patient.mobile_number.ilike(f"%{search}%"))
        if status_filter:
            stmt = stmt.where(Patient.status == status_filter.upper())
        stmt = stmt.limit(limit).offset(offset)
        result = await db_session.execute(stmt)
        return result.scalars().all()
    except Exception as e:
        logger.warning(f"Error reading patients in schema '{tenant_schema}': {e}. Falling back to clinic_default.")
        if is_postgres():
            try:
                await db_session.rollback()
                await db_session.execute(text('SET search_path TO "clinic_default", public;'))
                stmt = select(Patient)
                if search:
                    stmt = stmt.where(Patient.full_name.ilike(f"%{search}%") | Patient.mobile_number.ilike(f"%{search}%"))
                if status_filter:
                    stmt = stmt.where(Patient.status == status_filter.upper())
                res = await db_session.execute(stmt.limit(limit).offset(offset))
                return res.scalars().all()
            except Exception as e2:
                logger.error(f"Fallback patient query failed: {e2}")
                return []
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
    await db_session.commit()
    await db_session.refresh(patient)
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

    await db_session.commit()
    await db_session.refresh(patient)
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
    await db_session.commit()
    await db_session.refresh(patient)
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

    return WhatsAppConfigOut(
        clinic_id=clinic.id,
        clinic_name=clinic.name,
        whatsapp_phone_number_id=clinic.whatsapp_phone_number_id or settings.WHATSAPP_PHONE_NUMBER_ID,
        whatsapp_business_account_id=clinic.whatsapp_business_account_id or settings.WHATSAPP_BUSINESS_ACCOUNT_ID,
        whatsapp_access_token=clinic.whatsapp_access_token or (settings.WHATSAPP_ACCESS_TOKEN[:10] + "..." if settings.WHATSAPP_ACCESS_TOKEN else None),
        whatsapp_verify_token=clinic.whatsapp_verify_token or settings.WHATSAPP_VERIFY_TOKEN,
        bot_config=clinic.bot_config or default_bot_config,
        is_live=bool(clinic.whatsapp_phone_number_id or settings.WHATSAPP_PHONE_NUMBER_ID)
    )


@router.post("/whatsapp/config", response_model=WhatsAppConfigOut)
async def update_whatsapp_config(
    payload: WhatsAppConfigUpdate,
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

    await db_session.commit()
    await db_session.refresh(clinic)

    return WhatsAppConfigOut(
        clinic_id=clinic.id,
        clinic_name=clinic.name,
        whatsapp_phone_number_id=clinic.whatsapp_phone_number_id,
        whatsapp_business_account_id=clinic.whatsapp_business_account_id,
        whatsapp_access_token=clinic.whatsapp_access_token,
        whatsapp_verify_token=clinic.whatsapp_verify_token,
        bot_config=clinic.bot_config,
        is_live=bool(clinic.whatsapp_phone_number_id)
    )


@router.post("/whatsapp/test")
async def test_whatsapp_connection(
    payload: WhatsAppTestRequest,
    current_user: AdminUser = Depends(require_roles(["SUPER_ADMIN", "CLINIC_ADMIN"])),
    db_session: AsyncSession = Depends(get_db)
):
    from app.services.whatsapp_service import WhatsAppService
    wa_svc = WhatsAppService()
    success = await wa_svc.send_text_message(
        payload.test_mobile_number.strip(),
        f"✅ *WhatsApp API Test Successful!*\n\nConnected to Siddhi Patient-Doctor Assistant for {current_user.full_name}."
    )
    return {
        "status": "SUCCESS" if success else "FAILED",
        "mobile_number": payload.test_mobile_number,
        "message": "Test message dispatched successfully" if success else "Could not dispatch message. Verify credentials."
    }


# -----------------------------------------------------------------------------
# Specializations Master Endpoints (Global Master Catalog for Clinics & Doctors)
# -----------------------------------------------------------------------------
@router.get("/specializations", response_model=List[SpecializationOut])
async def list_specializations(
    search: Optional[str] = None,
    is_active: Optional[bool] = None,
    db_session: AsyncSession = Depends(get_db),
    current_user: Optional[AdminUser] = Depends(get_optional_admin)
):
    if is_postgres():
        await db_session.execute(text('SET search_path TO public;'))

    stmt = select(Specialization)
    if search:
        stmt = stmt.where(Specialization.name.ilike(f"%{search}%"))
    if is_active is not None:
        stmt = stmt.where(Specialization.is_active == is_active)
    stmt = stmt.order_by(Specialization.name.asc())
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
    await db_session.commit()
    await db_session.refresh(spec)
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

    await db_session.commit()
    await db_session.refresh(spec)
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
    await db_session.commit()
    await db_session.refresh(spec)
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
