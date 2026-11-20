import logging
from typing import List, Optional, Tuple, Dict, Any
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Query, status, Response
from sqlalchemy import select, and_, or_, desc, asc, text, func
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db, is_postgres, sanitize_schema_name
from app.models.domain import Appointment, Doctor, Clinic, AdminUser
from app.models.schemas import AppointmentOut, AppointmentCreate, AppointmentUpdate, AppointmentStatusUpdate
from app.services.database_service import db
from app.tools.appointment_tools import get_available_slots
from app.api.v1.auth import get_current_admin, get_optional_admin, require_permission, resolve_user_tenant_schema

router = APIRouter(prefix="/appointments", tags=["Appointments"])
logger = logging.getLogger("appointments_api")


async def find_appointment_and_schema(
    appointment_id: str,
    db_session: AsyncSession,
    preferred_schema: Optional[str] = None
) -> Tuple[Optional[Appointment], str]:
    """
    Locates an appointment by ID across tenant schemas safely using PostgreSQL savepoints.
    Leaves search_path set to the schema where the appointment was found.
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

    stmt = select(Appointment).where(Appointment.id == appointment_id)

    for s_name in schemas_to_try:
        if is_postgres():
            await db_session.execute(text(f'SET search_path TO "{s_name}", public;'))
        try:
            async with db_session.begin_nested():
                res = await db_session.execute(stmt)
                appt = res.scalar_one_or_none()
                if appt:
                    return appt, s_name
        except Exception:
            continue

    return None, schemas_to_try[0]


@router.get("", response_model=List[AppointmentOut])
async def list_appointments(
    response: Response,
    date: Optional[str] = Query(None, description="Filter by exact YYYY-MM-DD"),
    from_date: Optional[str] = Query(None, description="Filter from date YYYY-MM-DD"),
    to_date: Optional[str] = Query(None, description="Filter to date YYYY-MM-DD"),
    status: Optional[str] = Query(None, description="CONFIRMED, COMPLETED, CANCELLED, RESCHEDULED"),
    doctor_id: Optional[str] = None,
    search: Optional[str] = Query(None, description="Search by patient name, mobile, or doctor"),
    sort_by: Optional[str] = Query(None, description="Field to sort by (appointment_date, patient_name, doctor_name, status)"),
    sort_dir: Optional[str] = Query("desc", description="asc or desc"),
    page: Optional[int] = Query(None, ge=1, description="Page number (1-based)"),
    page_size: Optional[int] = Query(None, ge=1, description="Items per page"),
    limit: Optional[int] = None,
    offset: Optional[int] = None,
    current_user: AdminUser = Depends(require_permission("appointments", "view")),
    db_session: AsyncSession = Depends(get_db)
):
    appointments: List[Appointment] = []
    tenant_schema = await resolve_user_tenant_schema(current_user, db_session)
    safe_schema = sanitize_schema_name(tenant_schema) if tenant_schema and tenant_schema != "public" else None

    # Determine schemas to check
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

    # Build SQL Filter Conditions
    conditions = []
    if date:
        conditions.append(Appointment.appointment_date == date)
    if from_date:
        conditions.append(Appointment.appointment_date >= from_date)
    if to_date:
        conditions.append(Appointment.appointment_date <= to_date)
    if status and status != 'ALL':
        conditions.append(Appointment.status == status.upper())
    if doctor_id:
        conditions.append(Appointment.doctor_id == doctor_id)
    if search:
        search_filter = or_(
            Appointment.patient_name.ilike(f"%{search}%"),
            Appointment.mobile_number.ilike(f"%{search}%"),
            Appointment.doctor_name.ilike(f"%{search}%")
        )
        conditions.append(search_filter)

    # Sorting
    order_clause = desc(Appointment.appointment_datetime)
    is_asc = (sort_dir or "").lower() == "asc"

    if sort_by == "patient_name":
        order_clause = asc(Appointment.patient_name) if is_asc else desc(Appointment.patient_name)
    elif sort_by == "doctor_name":
        order_clause = asc(Appointment.doctor_name) if is_asc else desc(Appointment.doctor_name)
    elif sort_by == "appointment_date":
        order_clause = asc(Appointment.appointment_datetime) if is_asc else desc(Appointment.appointment_datetime)
    elif sort_by == "status":
        order_clause = asc(Appointment.status) if is_asc else desc(Appointment.status)
    elif sort_by == "created_at":
        order_clause = asc(Appointment.created_at) if is_asc else desc(Appointment.created_at)

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
                count_stmt = select(func.count(Appointment.id))
                if conditions:
                    count_stmt = count_stmt.where(and_(*conditions))
                c_res = await db_session.execute(count_stmt)
                schema_count = c_res.scalar_one_or_none() or 0
                total_count += schema_count

                # Query data slice
                data_stmt = select(Appointment)
                if conditions:
                    data_stmt = data_stmt.where(and_(*conditions))
                data_stmt = data_stmt.order_by(order_clause)
                if calc_limit is not None:
                    data_stmt = data_stmt.limit(calc_limit)
                if calc_offset is not None:
                    data_stmt = data_stmt.offset(calc_offset)

                res = await db_session.execute(data_stmt)
                for a in res.scalars().all():
                    if not any(existing.id == a.id for existing in appointments):
                        appointments.append(a)
        except Exception as e:
            logger.warning(f"Error querying appointments in schema '{s_name}': {e}")
            continue

    response.headers["X-Total-Count"] = str(total_count)
    return appointments


@router.get("/slots/available")
async def check_available_slots(
    date: str = Query(..., description="Target date YYYY-MM-DD"),
    doctor_id: Optional[str] = None,
    current_user: Optional[AdminUser] = Depends(get_optional_admin),
    db_session: AsyncSession = Depends(get_db)
):
    """
    Returns dynamically computed available slots for the given date,
    filtering out slots that have already been booked.
    """
    tenant_schema = "public"
    if current_user:
        tenant_schema = await resolve_user_tenant_schema(current_user, db_session)
    return await get_available_slots(date=date, doctor_id=doctor_id, tenant_schema=tenant_schema)


@router.post("", response_model=AppointmentOut, status_code=status.HTTP_201_CREATED)
async def create_manual_appointment(
    payload: AppointmentCreate,
    current_user: AdminUser = Depends(require_permission("appointments", "create")),
    db_session: AsyncSession = Depends(get_db)
):
    """
    Manually books an appointment from the Admin Portal into the user's clinic tenant schema.
    """
    tenant_schema = await resolve_user_tenant_schema(current_user, db_session)
    safe_schema = sanitize_schema_name(tenant_schema)

    res = await db.create_appointment({
        "patient_name": payload.patient_name,
        "mobile_number": payload.mobile_number,
        "date": payload.appointment_date,
        "time_slot": payload.time_slot,
        "doctor_id": payload.doctor_id,
        "clinic_id": payload.clinic_id,
        "status": "CONFIRMED"
    }, tenant_schema=safe_schema)

    appt, _ = await find_appointment_and_schema(res["id"], db_session, preferred_schema=safe_schema)
    if not appt:
        if is_postgres():
            await db_session.execute(text(f'SET search_path TO "{safe_schema}", public;'))
        stmt = select(Appointment).where(Appointment.id == res["id"])
        appt = (await db_session.execute(stmt)).scalar_one_or_none()
    return appt


@router.get("/{appointment_id}", response_model=AppointmentOut)
async def get_appointment(
    appointment_id: str,
    current_user: AdminUser = Depends(require_permission("appointments", "view")),
    db_session: AsyncSession = Depends(get_db)
):
    tenant_schema = await resolve_user_tenant_schema(current_user, db_session)
    appt, _ = await find_appointment_and_schema(appointment_id, db_session, preferred_schema=tenant_schema)
    if not appt:
        raise HTTPException(status_code=404, detail="Appointment not found")
    return appt


@router.patch("/{appointment_id}/status", response_model=AppointmentOut)
async def update_appointment_status(
    appointment_id: str,
    update_data: AppointmentStatusUpdate,
    current_user: AdminUser = Depends(get_current_admin),
    db_session: AsyncSession = Depends(get_db)
):
    # Action permission check: Cancelling requires "delete" permission; Check-In / Reschedule requires "edit"
    required_action = "delete" if update_data.status == "CANCELLED" else "edit"
    if current_user.role == "RECEPTIONIST":
        perms = current_user.permissions or {}
        has_perm = perms.get("appointments", {}).get(required_action, False)
        if not has_perm:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access denied: You do not have permission to '{required_action}' appointments."
            )

    tenant_schema = await resolve_user_tenant_schema(current_user, db_session)
    appt, matched_schema = await find_appointment_and_schema(appointment_id, db_session, preferred_schema=tenant_schema)
    if not appt:
        raise HTTPException(status_code=404, detail="Appointment not found")

    if is_postgres():
        await db_session.execute(text(f'SET search_path TO "{matched_schema}", public;'))

    appt.status = update_data.status
    if update_data.new_date and update_data.new_time_slot:
        appt.appointment_date = update_data.new_date
        appt.time_slot = update_data.new_time_slot
        appt.appointment_datetime = db.parse_slot_to_utc(update_data.new_date, update_data.new_time_slot)
        appt.reminder_sent = False  # Reset reminder for rescheduled slot

    await db_session.flush()
    await db_session.commit()
    if is_postgres():
        await db_session.execute(text(f'SET search_path TO "{matched_schema}", public;'))
    try:
        await db_session.refresh(appt)
    except Exception:
        pass
    return appt


@router.put("/{appointment_id}", response_model=AppointmentOut)
async def update_appointment(
    appointment_id: str,
    payload: AppointmentUpdate,
    current_user: AdminUser = Depends(require_permission("appointments", "edit")),
    db_session: AsyncSession = Depends(get_db)
):
    tenant_schema = await resolve_user_tenant_schema(current_user, db_session)
    appt, matched_schema = await find_appointment_and_schema(appointment_id, db_session, preferred_schema=tenant_schema)
    if not appt:
        raise HTTPException(status_code=404, detail="Appointment not found")

    if is_postgres():
        await db_session.execute(text(f'SET search_path TO "{matched_schema}", public;'))

    if payload.patient_name is not None:
        appt.patient_name = payload.patient_name.strip()
    if payload.mobile_number is not None:
        appt.mobile_number = payload.mobile_number.strip()
    if payload.status is not None:
        appt.status = payload.status

    if payload.doctor_id is not None:
        appt.doctor_id = payload.doctor_id
        # Look up doctor name
        doc_stmt = select(Doctor).where(Doctor.id == payload.doctor_id)
        doc = (await db_session.execute(doc_stmt)).scalar_one_or_none()
        if doc:
            appt.doctor_name = doc.name

    date_changed = payload.appointment_date is not None and payload.appointment_date != appt.appointment_date
    slot_changed = payload.time_slot is not None and payload.time_slot != appt.time_slot

    if payload.appointment_date is not None:
        appt.appointment_date = payload.appointment_date
    if payload.time_slot is not None:
        appt.time_slot = payload.time_slot

    if date_changed or slot_changed:
        appt.appointment_datetime = db.parse_slot_to_utc(appt.appointment_date, appt.time_slot)
        appt.reminder_sent = False

    await db_session.flush()
    await db_session.commit()
    if is_postgres():
        await db_session.execute(text(f'SET search_path TO "{matched_schema}", public;'))
    try:
        await db_session.refresh(appt)
    except Exception:
        pass
    return appt
