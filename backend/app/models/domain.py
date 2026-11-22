import uuid
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any
from sqlalchemy import String, Boolean, DateTime, ForeignKey, Integer, Text, JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.core.database import Base


def generate_uuid() -> str:
    return str(uuid.uuid4())


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def get_default_permissions(role: str = "RECEPTIONIST") -> Dict[str, Dict[str, bool]]:
    """
    Generates granular screen access and action permission matrix.
    Actions per screen: view, create, edit, delete.
    """
    if role in ["SUPER_ADMIN", "CLINIC_ADMIN"]:
        return {
            "appointments": {"view": True, "create": True, "edit": True, "delete": True},
            "patients": {"view": True, "create": True, "edit": True, "delete": True},
            "doctors": {"view": True, "create": True, "edit": True, "delete": True},
            "simulator": {"view": True, "create": True, "edit": True, "delete": True},
            "analytics": {"view": True, "create": True, "edit": True, "delete": True},
            "users": {"view": True, "create": True, "edit": True, "delete": True},
        }
    # Default granular permissions for Front Desk (Receptionist)
    return {
        "appointments": {"view": True, "create": True, "edit": True, "delete": False},
        "patients": {"view": True, "create": True, "edit": True, "delete": False},
        "doctors": {"view": True, "create": False, "edit": False, "delete": False},
        "simulator": {"view": True, "create": True, "edit": False, "delete": False},
        "analytics": {"view": False, "create": False, "edit": False, "delete": False},
        "users": {"view": False, "create": False, "edit": False, "delete": False},
    }


class Specialization(Base):
    """
    Master table for medical specializations (e.g., Cardiologist, Dentist, Pediatrician).
    Administered by Super Admin & Clinic Admins.
    """
    __tablename__ = "specializations"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    name: Mapped[str] = mapped_column(String(100), unique=True, nullable=False, index=True)
    description: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, onupdate=utc_now)


class Tenant(Base):
    """
    Tenant = Clinic in the multi-tenant architecture.
    Each Clinic Tenant has its own dedicated PostgreSQL schema (schema_name).
    """
    __tablename__ = "tenants"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    # Dedicated PostgreSQL schema for this clinic tenant
    schema_name: Mapped[str] = mapped_column(String(63), nullable=False)
    owner_name: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    owner_phone: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    owner_email: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="ACTIVE")  # ACTIVE, SUSPENDED
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, onupdate=utc_now)

    clinics: Mapped[List["Clinic"]] = relationship("Clinic", back_populates="tenant", cascade="all, delete-orphan")


class Clinic(Base):
    __tablename__ = "clinics"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    tenant_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("tenants.id"), nullable=True, default=None)
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    address: Mapped[str] = mapped_column(String(255), nullable=False)
    phone: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    timezone: Mapped[str] = mapped_column(String(50), default="Asia/Kolkata")
    consultation_hours: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    whatsapp_phone_number_id: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    whatsapp_business_account_id: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    whatsapp_access_token: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    whatsapp_verify_token: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    bot_config: Mapped[Optional[Dict[str, Any]]] = mapped_column(JSON, nullable=True)
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
    specialty: Mapped[str] = mapped_column(String(255), nullable=False)
    available_days: Mapped[str] = mapped_column(String(100), nullable=False)
    morning_slots: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    evening_slots: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    slot_duration_minutes: Mapped[int] = mapped_column(Integer, default=30)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, onupdate=utc_now)

    clinic: Mapped["Clinic"] = relationship("Clinic", back_populates="doctors")
    appointments: Mapped[List["Appointment"]] = relationship("Appointment", back_populates="doctor")


class Patient(Base):
    __tablename__ = "patients"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    tenant_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True, default=None, index=True)
    full_name: Mapped[str] = mapped_column(String(120), nullable=False)
    mobile_number: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    email: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    gender: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    age: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    address: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="ACTIVE")  # ACTIVE, INACTIVE
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, onupdate=utc_now)


class Appointment(Base):
    __tablename__ = "appointments"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    tenant_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True, default=None, index=True)
    clinic_id: Mapped[str] = mapped_column(String(36), ForeignKey("clinics.id"), nullable=False, index=True)
    doctor_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("doctors.id"), nullable=True)
    patient_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)

    patient_name: Mapped[str] = mapped_column(String(120), nullable=False)
    mobile_number: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    doctor_name: Mapped[str] = mapped_column(String(100), nullable=False)
    clinic_name: Mapped[str] = mapped_column(String(150), nullable=False)
    clinic_address: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)

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
    username: Mapped[str] = mapped_column(String(50), unique=True, nullable=False, index=True)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    full_name: Mapped[str] = mapped_column(String(100), nullable=False)
    # Role: 'SUPER_ADMIN' (Product Owner), 'CLINIC_ADMIN' (Doctor), 'RECEPTIONIST' (Front Desk)
    role: Mapped[str] = mapped_column(String(30), nullable=False, index=True)
    tenant_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    clinic_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    # Granular screen access and action permission matrix (view, create, edit, delete)
    permissions: Mapped[Optional[Dict[str, Any]]] = mapped_column(JSON, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, onupdate=utc_now)
