import logging
from typing import List, Optional
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select, and_, or_, desc, text
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db, is_postgres
from app.models.domain import Appointment, Doctor, Clinic, AdminUser
from app.models.schemas import AppointmentOut, AppointmentCreate, AppointmentUpdate, AppointmentStatusUpdate
from app.services.database_service import db
from app.tools.appointment_tools import get_available_slots
from app.api.v1.auth import get_current_admin, get_optional_admin, require_permission, resolve_user_tenant_schema

router = APIRouter(prefix="/appointments", tags=["Appointments"])
logger = logging.getLogger("appointments_api")


@router.get("", response_model=List[AppointmentOut])
async def list_appointments(
    date: Optional[str] = Query(None, description="Filter by YYYY-MM-DD"),
    status: Optional[str] = Query(None, description="CONFIRMED, COMPLETED, CANCELLED, RESCHEDULED"),
    doctor_id: Optional[str] = None,
    search: Optional[str] = Query(None, description="Search by patient name or phone"),
    limit: int = 100,
    offset: int = 0,
    current_user: AdminUser = Depends(require_permission("appointments", "view")),
    db_session: AsyncSession = Depends(get_db)
):
    tenant_schema = await resolve_user_tenant_schema(current_user, db_session)
    if is_postgres():
        await db_session.execute(text(f'SET search_path TO "{tenant_schema}", public;'))

    stmt = select(Appointment)
    conditions = []

    if date:
        conditions.append(Appointment.appointment_date == date)
    if status:
        conditions.append(Appointment.status == status)
    if doctor_id:
        conditions.append(Appointment.doctor_id == doctor_id)
    if search:
        search_filter = or_(
            Appointment.patient_name.ilike(f"%{search}%"),
            Appointment.mobile_number.ilike(f"%{search}%")
        )
        conditions.append(search_filter)

    if conditions:
        stmt = stmt.where(and_(*conditions))

    stmt = stmt.order_by(desc(Appointment.appointment_datetime)).limit(limit).offset(offset)
    result = await db_session.execute(stmt)
    return result.scalars().all()


@router.get("/slots/available")
async def check_available_slots(
    date: str = Query(..., description="Target date YYYY-MM-DD"),
    doctor_id: Optional[str] = Query(None, description="Doctor ID"),
    current_user: Optional[AdminUser] = Depends(get_optional_admin),
    db_session: AsyncSession = Depends(get_db)
):
    """
    Returns open doctor appointment time slots for a given date and doctor,
    factoring in configured duration interval (5, 10, 15, 30 min) and existing bookings.
    """
    tenant_schema = "clinic_default"
    if current_user:
        tenant_schema = await resolve_user_tenant_schema(current_user, db_session)
    res = await get_available_slots(date, doctor_id=doctor_id, tenant_schema=tenant_schema)
    return res


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

    res = await db.create_appointment({
        "patient_name": payload.patient_name,
        "mobile_number": payload.mobile_number,
        "date": payload.appointment_date,
        "time_slot": payload.time_slot,
        "doctor_id": payload.doctor_id,
        "clinic_id": payload.clinic_id,
        "tenant_id": current_user.tenant_id or "tenant_default",
        "status": "CONFIRMED"
    }, tenant_schema=tenant_schema)

    if is_postgres():
        await db_session.execute(text(f'SET search_path TO "{tenant_schema}", public;'))

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
    if is_postgres():
        await db_session.execute(text(f'SET search_path TO "{tenant_schema}", public;'))

    stmt = select(Appointment).where(Appointment.id == appointment_id)
    appt = (await db_session.execute(stmt)).scalar_one_or_none()
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
    if is_postgres():
        await db_session.execute(text(f'SET search_path TO "{tenant_schema}", public;'))

    stmt = select(Appointment).where(Appointment.id == appointment_id)
    result = await db_session.execute(stmt)
    appt = result.scalar_one_or_none()
    if not appt:
        raise HTTPException(status_code=404, detail="Appointment not found")

    appt.status = update_data.status
    if update_data.new_date and update_data.new_time_slot:
        appt.appointment_date = update_data.new_date
        appt.time_slot = update_data.new_time_slot
        appt.appointment_datetime = db.parse_slot_to_utc(update_data.new_date, update_data.new_time_slot)
        appt.reminder_sent = False  # Reset reminder for rescheduled slot

    await db_session.commit()
    await db_session.refresh(appt)
    return appt


@router.put("/{appointment_id}", response_model=AppointmentOut)
async def update_appointment(
    appointment_id: str,
    payload: AppointmentUpdate,
    current_user: AdminUser = Depends(require_permission("appointments", "edit")),
    db_session: AsyncSession = Depends(get_db)
):
    tenant_schema = await resolve_user_tenant_schema(current_user, db_session)
    if is_postgres():
        await db_session.execute(text(f'SET search_path TO "{tenant_schema}", public;'))

    stmt = select(Appointment).where(Appointment.id == appointment_id)
    appt = (await db_session.execute(stmt)).scalar_one_or_none()
    if not appt:
        raise HTTPException(status_code=404, detail="Appointment not found")

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

    await db_session.commit()
    await db_session.refresh(appt)
    return appt
