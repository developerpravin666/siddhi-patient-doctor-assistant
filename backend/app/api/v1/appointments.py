import logging
from typing import List, Optional
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select, and_, or_, desc
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db
from app.models.domain import Appointment, Doctor, Clinic
from app.models.schemas import AppointmentOut, AppointmentCreate, AppointmentStatusUpdate
from app.services.database_service import db
from app.tools.appointment_tools import get_available_slots

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
    db_session: AsyncSession = Depends(get_db)
):
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
async def check_available_slots(date: str = Query(..., description="Target date YYYY-MM-DD")):
    """
    Returns open doctor appointment time slots for a given date.
    """
    res = await get_available_slots(date)
    return res


@router.post("", response_model=AppointmentOut, status_code=status.HTTP_201_CREATED)
async def create_manual_appointment(
    payload: AppointmentCreate,
    db_session: AsyncSession = Depends(get_db)
):
    """
    Manually books an appointment from the Admin Portal.
    """
    res = await db.create_appointment({
        "patient_name": payload.patient_name,
        "mobile_number": payload.mobile_number,
        "date": payload.appointment_date,
        "time_slot": payload.time_slot,
        "doctor_id": payload.doctor_id,
        "clinic_id": payload.clinic_id,
        "status": "CONFIRMED"
    })

    stmt = select(Appointment).where(Appointment.id == res["id"])
    appt = (await db_session.execute(stmt)).scalar_one_or_none()
    return appt


@router.get("/{appointment_id}", response_model=AppointmentOut)
async def get_appointment(appointment_id: str, db_session: AsyncSession = Depends(get_db)):
    stmt = select(Appointment).where(Appointment.id == appointment_id)
    appt = (await db_session.execute(stmt)).scalar_one_or_none()
    if not appt:
        raise HTTPException(status_code=404, detail="Appointment not found")
    return appt


@router.patch("/{appointment_id}/status", response_model=AppointmentOut)
async def update_appointment_status(
    appointment_id: str,
    update_data: AppointmentStatusUpdate,
    db_session: AsyncSession = Depends(get_db)
):
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
