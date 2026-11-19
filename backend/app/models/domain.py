import uuid
from datetime import datetime, timezone
from typing import Optional, List
from sqlalchemy import String, Boolean, DateTime, ForeignKey, Integer, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.core.database import Base


def generate_uuid() -> str:
    return str(uuid.uuid4())


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class Tenant(Base):
    __tablename__ = "tenants"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="ACTIVE")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, onupdate=utc_now)

    clinics: Mapped[List["Clinic"]] = relationship("Clinic", back_populates="tenant", cascade="all, delete-orphan")


class Clinic(Base):
    __tablename__ = "clinics"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    tenant_id: Mapped[str] = mapped_column(String(36), ForeignKey("tenants.id"), nullable=False)
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    address: Mapped[str] = mapped_column(String(255), nullable=False)
    phone: Mapped[str] = mapped_column(String(30), default="+91 98765 00000")
    timezone: Mapped[str] = mapped_column(String(50), default="Asia/Kolkata")
    consultation_hours: Mapped[str] = mapped_column(
        String(255),
        default="Monday - Saturday: 9:00 AM - 1:00 PM, 4:00 PM - 7:30 PM (Sundays Closed)"
    )
    whatsapp_phone_number_id: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, onupdate=utc_now)

    tenant: Mapped["Tenant"] = relationship("Tenant", back_populates="clinics")
    doctors: Mapped[List["Doctor"]] = relationship("Doctor", back_populates="clinic", cascade="all, delete-orphan")
    appointments: Mapped[List["Appointment"]] = relationship("Appointment", back_populates="clinic")


class Doctor(Base):
    __tablename__ = "doctors"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    clinic_id: Mapped[str] = mapped_column(String(36), ForeignKey("clinics.id"), nullable=False)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    specialty: Mapped[str] = mapped_column(String(100), default="General Physician")
    available_days: Mapped[str] = mapped_column(String(100), default="Mon,Tue,Wed,Thu,Fri,Sat")
    morning_slots: Mapped[str] = mapped_column(
        String(255),
        default="09:00 AM,09:30 AM,10:00 AM,10:30 AM,11:00 AM,11:30 AM,12:00 PM,12:30 PM"
    )
    evening_slots: Mapped[str] = mapped_column(
        String(255),
        default="04:00 PM,04:30 PM,05:00 PM,05:30 PM,06:00 PM,06:30 PM,07:00 PM"
    )
    slot_duration_minutes: Mapped[int] = mapped_column(Integer, default=30)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, onupdate=utc_now)

    clinic: Mapped["Clinic"] = relationship("Clinic", back_populates="doctors")
    appointments: Mapped[List["Appointment"]] = relationship("Appointment", back_populates="doctor")


class Patient(Base):
    __tablename__ = "patients"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    tenant_id: Mapped[str] = mapped_column(String(36), nullable=False)
    full_name: Mapped[str] = mapped_column(String(120), nullable=False)
    mobile_number: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, onupdate=utc_now)


class Appointment(Base):
    __tablename__ = "appointments"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    tenant_id: Mapped[str] = mapped_column(String(36), nullable=False, default="tenant_default")
    clinic_id: Mapped[str] = mapped_column(String(36), ForeignKey("clinics.id"), nullable=False)
    doctor_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("doctors.id"), nullable=True)
    patient_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)

    patient_name: Mapped[str] = mapped_column(String(120), nullable=False)
    mobile_number: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    doctor_name: Mapped[str] = mapped_column(String(100), default="Dr. Siddhi Patel")
    clinic_name: Mapped[str] = mapped_column(String(150), default="Dr. Siddhi Patel's Clinic")
    clinic_address: Mapped[str] = mapped_column(String(255), default="Suite 402, Siddhi Medical Enclave, Central Avenue")

    appointment_date: Mapped[str] = mapped_column(String(15), nullable=False, index=True)  # YYYY-MM-DD
    time_slot: Mapped[str] = mapped_column(String(20), nullable=False)                     # e.g. 10:30 AM
    appointment_datetime: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)

    status: Mapped[str] = mapped_column(String(25), default="CONFIRMED")  # CONFIRMED, COMPLETED, CANCELLED, RESCHEDULED
    reminder_sent: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    reminder_sent_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, onupdate=utc_now)

    clinic: Mapped["Clinic"] = relationship("Clinic", back_populates="appointments")
    doctor: Mapped[Optional["Doctor"]] = relationship("Doctor", back_populates="appointments")


class AdminUser(Base):
    __tablename__ = "admin_users"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    username: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    full_name: Mapped[str] = mapped_column(String(100), nullable=False)
    role: Mapped[str] = mapped_column(String(30), default="CLINIC_ADMIN")  # SUPER_ADMIN, CLINIC_ADMIN, RECEPTIONIST
    tenant_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
