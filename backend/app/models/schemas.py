from datetime import datetime
from typing import Optional, List, Any, Dict
from pydantic import BaseModel, Field


# -----------------------------------------------------------------------------
# Auth Schemas
# -----------------------------------------------------------------------------
class LoginRequest(BaseModel):
    username: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: Dict[str, Any]


class AdminUserCreate(BaseModel):
    username: str
    password: str
    full_name: str
    role: str = "CLINIC_ADMIN"
    tenant_id: Optional[str] = None


class AdminUserOut(BaseModel):
    id: str
    username: str
    full_name: str
    role: str
    tenant_id: Optional[str] = None
    is_active: bool
    created_at: datetime


# -----------------------------------------------------------------------------
# Appointment Schemas
# -----------------------------------------------------------------------------
class AppointmentCreate(BaseModel):
    patient_name: str = Field(..., min_length=2, max_length=120)
    mobile_number: str = Field(..., min_length=10, max_length=15)
    appointment_date: str = Field(..., description="YYYY-MM-DD")
    time_slot: str = Field(..., description="e.g. 10:30 AM")
    doctor_id: Optional[str] = None
    clinic_id: Optional[str] = None
    notes: Optional[str] = None


class AppointmentStatusUpdate(BaseModel):
    status: str = Field(..., description="CONFIRMED, COMPLETED, CANCELLED, RESCHEDULED")
    new_date: Optional[str] = None
    new_time_slot: Optional[str] = None


class AppointmentOut(BaseModel):
    id: str
    tenant_id: str
    clinic_id: str
    doctor_id: Optional[str] = None
    patient_name: str
    mobile_number: str
    doctor_name: str
    clinic_name: str
    clinic_address: str
    appointment_date: str
    time_slot: str
    appointment_datetime: datetime
    status: str
    reminder_sent: bool
    reminder_sent_at: Optional[datetime] = None
    created_at: datetime

    class Config:
        from_attributes = True


# -----------------------------------------------------------------------------
# Doctor Schemas
# -----------------------------------------------------------------------------
class DoctorCreate(BaseModel):
    clinic_id: str
    name: str
    specialty: str = "General Physician"
    available_days: str = "Mon,Tue,Wed,Thu,Fri,Sat"
    morning_slots: Optional[str] = None
    evening_slots: Optional[str] = None
    slot_duration_minutes: int = 30
    is_active: bool = True


class DoctorOut(BaseModel):
    id: str
    clinic_id: str
    name: str
    specialty: str
    available_days: str
    morning_slots: str
    evening_slots: str
    slot_duration_minutes: int
    is_active: bool
    created_at: datetime

    class Config:
        from_attributes = True


# -----------------------------------------------------------------------------
# Clinic Schemas
# -----------------------------------------------------------------------------
class ClinicCreate(BaseModel):
    tenant_id: str
    name: str
    address: str
    phone: str = "+91 98765 00000"
    timezone: str = "Asia/Kolkata"
    consultation_hours: Optional[str] = None


class ClinicOut(BaseModel):
    id: str
    tenant_id: str
    name: str
    address: str
    phone: str
    timezone: str
    consultation_hours: str
    created_at: datetime

    class Config:
        from_attributes = True


# -----------------------------------------------------------------------------
# Patient Schemas
# -----------------------------------------------------------------------------
class PatientOut(BaseModel):
    id: str
    tenant_id: str
    full_name: str
    mobile_number: str
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# -----------------------------------------------------------------------------
# WhatsApp Webhook & Simulator Schemas
# -----------------------------------------------------------------------------
class SimulatorChatRequest(BaseModel):
    phone_number: str = "919823012345"
    message_text: str
    clinic_id: Optional[str] = None


class SimulatorChatResponse(BaseModel):
    reply_text: str
    session_state: Dict[str, Any]
    detected_intent: Optional[str] = None
    tools_executed: List[str] = []
