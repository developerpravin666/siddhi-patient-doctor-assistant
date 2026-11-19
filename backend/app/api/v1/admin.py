import logging
from typing import List, Dict, Any, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db
from app.models.domain import Tenant, Clinic, Doctor, Patient, Appointment
from app.models.schemas import DoctorOut, DoctorCreate, ClinicOut, ClinicCreate, PatientOut
from app.services.database_service import db

router = APIRouter(prefix="/admin", tags=["Admin Management"])
logger = logging.getLogger("admin_api")


@router.get("/stats")
async def get_admin_dashboard_stats():
    """
    Returns live KPIs: total appointments, today's appointments, confirmed,
    cancelled, active patients, doctors, and pending reminders.
    """
    return await db.get_stats()


# -----------------------------------------------------------------------------
# Doctors Endpoints
# -----------------------------------------------------------------------------
@router.get("/doctors", response_model=List[DoctorOut])
async def list_doctors(clinic_id: Optional[str] = None, db_session: AsyncSession = Depends(get_db)):
    stmt = select(Doctor)
    if clinic_id:
        stmt = stmt.where(Doctor.clinic_id == clinic_id)
    result = await db_session.execute(stmt)
    return result.scalars().all()


@router.post("/doctors", response_model=DoctorOut, status_code=status.HTTP_201_CREATED)
async def create_doctor(payload: DoctorCreate, db_session: AsyncSession = Depends(get_db)):
    doctor = Doctor(
        clinic_id=payload.clinic_id,
        name=payload.name,
        specialty=payload.specialty,
        available_days=payload.available_days,
        morning_slots=payload.morning_slots or "09:00 AM,09:30 AM,10:00 AM,10:30 AM,11:00 AM,11:30 AM",
        evening_slots=payload.evening_slots or "04:00 PM,04:30 PM,05:00 PM,05:30 PM,06:00 PM",
        slot_duration_minutes=payload.slot_duration_minutes,
        is_active=payload.is_active
    )
    db_session.add(doctor)
    await db_session.commit()
    await db_session.refresh(doctor)
    return doctor


# -----------------------------------------------------------------------------
# Clinics Endpoints
# -----------------------------------------------------------------------------
@router.get("/clinics", response_model=List[ClinicOut])
async def list_clinics(db_session: AsyncSession = Depends(get_db)):
    stmt = select(Clinic)
    result = await db_session.execute(stmt)
    return result.scalars().all()


# -----------------------------------------------------------------------------
# Patients Endpoints
# -----------------------------------------------------------------------------
@router.get("/patients", response_model=List[PatientOut])
async def list_patients(
    search: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
    db_session: AsyncSession = Depends(get_db)
):
    stmt = select(Patient)
    if search:
        stmt = stmt.where(Patient.full_name.ilike(f"%{search}%") | Patient.mobile_number.ilike(f"%{search}%"))
    stmt = stmt.limit(limit).offset(offset)
    result = await db_session.execute(stmt)
    return result.scalars().all()
