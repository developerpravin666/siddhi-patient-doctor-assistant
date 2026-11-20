from datetime import datetime
from typing import Optional, List, Any, Dict
from pydantic import BaseModel, Field


# -----------------------------------------------------------------------------
# Auth & User Schemas
# -----------------------------------------------------------------------------
class LoginRequest(BaseModel):
    username: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: Dict[str, Any]


class AdminUserCreate(BaseModel):
    username: str = Field(..., min_length=3, max_length=50)
    password: str = Field(..., min_length=6)
    full_name: str = Field(..., min_length=2, max_length=100)
    role: str = Field(..., description="SUPER_ADMIN, CLINIC_ADMIN, RECEPTIONIST")
    tenant_id: Optional[str] = None
    clinic_id: Optional[str] = None
    permissions: Optional[Dict[str, Dict[str, bool]]] = None


class AdminUserUpdate(BaseModel):
    full_name: Optional[str] = None
    role: Optional[str] = None
    tenant_id: Optional[str] = None
    clinic_id: Optional[str] = None
    permissions: Optional[Dict[str, Dict[str, bool]]] = None
    is_active: Optional[bool] = None
    password: Optional[str] = None


class AdminUserOut(BaseModel):
    id: str
    username: str
    full_name: str
    role: str
    tenant_id: Optional[str] = None
    clinic_id: Optional[str] = None
    permissions: Optional[Dict[str, Dict[str, bool]]] = None
    is_active: bool
    created_at: datetime

    class Config:
        from_attributes = True


# -----------------------------------------------------------------------------
# Tenant Schemas (Clinic = Tenant)
# -----------------------------------------------------------------------------
class TenantCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=100, description="Clinic / Tenant Name")
    schema_name: Optional[str] = Field(None, description="PostgreSQL Schema Name (auto-generated if omitted)")
    owner_name: Optional[str] = Field(None, description="Doctor / Owner Full Name")
    owner_phone: Optional[str] = None
    owner_email: Optional[str] = None
    admin_username: Optional[str] = Field(None, description="Initial Clinic Admin username for Doctor/Owner")
    admin_password: Optional[str] = Field(None, description="Initial Clinic Admin password")
    status: str = "ACTIVE"


class TenantUpdate(BaseModel):
    name: Optional[str] = None
    owner_name: Optional[str] = None
    owner_phone: Optional[str] = None
    owner_email: Optional[str] = None
    status: Optional[str] = None


class TenantOut(BaseModel):
    id: str
    name: str
    schema_name: str
    owner_name: Optional[str] = None
    owner_phone: Optional[str] = None
    owner_email: Optional[str] = None
    admin_username: Optional[str] = None
    status: str
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


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


class AppointmentUpdate(BaseModel):
    patient_name: Optional[str] = None
    mobile_number: Optional[str] = None
    appointment_date: Optional[str] = None
    time_slot: Optional[str] = None
    doctor_id: Optional[str] = None
    clinic_id: Optional[str] = None
    status: Optional[str] = None
    notes: Optional[str] = None


class AppointmentOut(BaseModel):
    id: str
    tenant_id: Optional[str] = None
    clinic_id: str
    doctor_id: Optional[str] = None
    patient_name: str
    mobile_number: str
    doctor_name: str
    clinic_name: str
    clinic_address: Optional[str] = None
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
# Specialization Master Schemas
# -----------------------------------------------------------------------------
class SpecializationCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=100, description="Specialization title, e.g. Cardiologist")
    description: Optional[str] = None
    is_active: bool = True


class SpecializationUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    is_active: Optional[bool] = None


class SpecializationStatusUpdate(BaseModel):
    is_active: bool


class SpecializationOut(BaseModel):
    id: str
    name: str
    description: Optional[str] = None
    is_active: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# -----------------------------------------------------------------------------
# Doctor Schemas
# -----------------------------------------------------------------------------
class DoctorCreate(BaseModel):
    clinic_id: Optional[str] = None
    name: str
    specialty: Optional[str] = None
    specialties: Optional[List[str]] = None
    available_days: str = "Mon,Tue,Wed,Thu,Fri,Sat"
    morning_slots: Optional[str] = None
    evening_slots: Optional[str] = None
    slot_duration_minutes: int = 15
    is_active: bool = True


class DoctorUpdate(BaseModel):
    name: Optional[str] = None
    specialty: Optional[str] = None
    specialties: Optional[List[str]] = None
    available_days: Optional[str] = None
    morning_slots: Optional[str] = None
    evening_slots: Optional[str] = None
    slot_duration_minutes: Optional[int] = None
    is_active: Optional[bool] = None


class DoctorStatusUpdate(BaseModel):
    is_active: bool


class DoctorOut(BaseModel):
    id: str
    clinic_id: str
    name: str
    specialty: str
    available_days: str
    morning_slots: Optional[str] = None
    evening_slots: Optional[str] = None
    slot_duration_minutes: int
    is_active: bool
    created_at: datetime

    class Config:
        from_attributes = True


# -----------------------------------------------------------------------------
# Clinic Schemas
# -----------------------------------------------------------------------------
class ClinicCreate(BaseModel):
    tenant_id: Optional[str] = None
    name: str
    address: str
    phone: Optional[str] = None
    timezone: str = "Asia/Kolkata"
    consultation_hours: Optional[str] = None


class ClinicUpdate(BaseModel):
    name: Optional[str] = None
    address: Optional[str] = None
    phone: Optional[str] = None
    timezone: Optional[str] = None
    consultation_hours: Optional[str] = None
    whatsapp_phone_number_id: Optional[str] = None


class ClinicOut(BaseModel):
    id: str
    tenant_id: Optional[str] = None
    name: str
    address: str
    phone: Optional[str] = None
    timezone: str
    consultation_hours: Optional[str] = None
    whatsapp_phone_number_id: Optional[str] = None
    whatsapp_business_account_id: Optional[str] = None
    whatsapp_access_token: Optional[str] = None
    whatsapp_verify_token: Optional[str] = None
    bot_config: Optional[Dict[str, Any]] = None
    created_at: datetime

    class Config:
        from_attributes = True


# -----------------------------------------------------------------------------
# Patient Schemas
# -----------------------------------------------------------------------------
class PatientCreate(BaseModel):
    full_name: str = Field(..., min_length=2, max_length=120)
    mobile_number: str = Field(..., min_length=10, max_length=20)
    email: Optional[str] = None
    gender: Optional[str] = None
    age: Optional[int] = None
    address: Optional[str] = None
    status: str = "ACTIVE"
    is_active: bool = True


class PatientUpdate(BaseModel):
    full_name: Optional[str] = None
    mobile_number: Optional[str] = None
    email: Optional[str] = None
    gender: Optional[str] = None
    age: Optional[int] = None
    address: Optional[str] = None
    status: Optional[str] = None
    is_active: Optional[bool] = None


class PatientStatusUpdate(BaseModel):
    is_active: bool


class PatientOut(BaseModel):
    id: str
    tenant_id: Optional[str] = None
    full_name: str
    mobile_number: str
    email: Optional[str] = None
    gender: Optional[str] = None
    age: Optional[int] = None
    address: Optional[str] = None
    status: str = "ACTIVE"
    is_active: bool = True
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# -----------------------------------------------------------------------------
# WhatsApp API Configuration Schemas
# -----------------------------------------------------------------------------
class WhatsAppConfigUpdate(BaseModel):
    whatsapp_phone_number_id: Optional[str] = None
    whatsapp_business_account_id: Optional[str] = None
    whatsapp_access_token: Optional[str] = None
    whatsapp_verify_token: Optional[str] = None
    bot_config: Optional[Dict[str, Any]] = None


class WhatsAppConfigOut(BaseModel):
    clinic_id: str
    clinic_name: str
    whatsapp_phone_number_id: Optional[str] = None
    whatsapp_business_account_id: Optional[str] = None
    whatsapp_access_token: Optional[str] = None
    whatsapp_verify_token: Optional[str] = None
    bot_config: Optional[Dict[str, Any]] = None
    is_live: bool = False


class WhatsAppTestRequest(BaseModel):
    test_mobile_number: str
    message: Optional[str] = "Hello from Siddhi Appointment Assistant! This is a test message to confirm your WhatsApp Business API configuration."


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
