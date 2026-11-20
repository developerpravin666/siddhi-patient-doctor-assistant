import logging
from datetime import datetime, timezone
from typing import List, Optional, Dict, Any
import pytz
from dateutil import parser
from sqlalchemy import select, and_, func, text
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import AsyncSessionLocal, provision_tenant_schema, is_postgres, sanitize_schema_name
from app.core.config import settings
from app.core.security import get_password_hash
from app.models.domain import Tenant, Clinic, Doctor, Patient, Appointment, AdminUser, Specialization, get_default_permissions

logger = logging.getLogger("database_service")


class DatabaseService:
    @staticmethod
    def parse_slot_to_utc(date_str: str, time_str: str, tz_name: str = "Asia/Kolkata") -> datetime:
        """
        Converts appointment date ('YYYY-MM-DD') and time ('10:30 AM') in local timezone to UTC datetime.
        """
        try:
            local_tz = pytz.timezone(tz_name)
            # Combine date and time
            combined_str = f"{date_str} {time_str}"
            dt_naive = parser.parse(combined_str)
            dt_localized = local_tz.localize(dt_naive)
            return dt_localized.astimezone(pytz.UTC)
        except Exception as e:
            logger.error(f"Error parsing slot to UTC ({date_str} {time_str}): {e}")
            return datetime.now(timezone.utc)

    @staticmethod
    async def seed_defaults_if_empty():
        """
        Ensures ONLY the initial default Super Admin / Product Owner account exists in public.admin_users
        so they can log in for the very first time.
        No dummy clinic, doctor, patient, or staff seed data is added;
        the Super Admin onboards clinics (tenant admin), who then create their own doctors and frontend staff.
        """
        async with AsyncSessionLocal() as session:
            try:
                if is_postgres():
                    await session.execute(text('SET search_path TO public;'))

                res = await session.execute(select(AdminUser).where(AdminUser.username == "superadmin"))
                existing_sa = res.scalar_one_or_none()
                if not existing_sa:
                    sa_user = AdminUser(
                        username="superadmin",
                        hashed_password=get_password_hash("superadmin123"),
                        full_name="Super Admin (Product Owner)",
                        role="SUPER_ADMIN",
                        tenant_id=None,
                        clinic_id=None,
                        permissions=get_default_permissions("SUPER_ADMIN"),
                        is_active=True
                    )
                    session.add(sa_user)
                    await session.commit()
                    logger.info("Seeded initial Super Admin account (username: 'superadmin') for first-time login.")
                elif not existing_sa.permissions:
                    existing_sa.permissions = get_default_permissions("SUPER_ADMIN")
                    await session.commit()

                # Seed initial medical specializations into master table if empty
                spec_res = await session.execute(select(Specialization).limit(1))
                if not spec_res.scalar_one_or_none():
                    default_specs = [
                        "Cardiologist", "Dentist", "Dermatologist", "ENT Specialist",
                        "General Physician", "Gynecologist", "Neurologist", "Ophthalmologist",
                        "Orthopedic Surgeon", "Pediatrician", "Psychiatrist", "Urologist"
                    ]
                    for sp_name in default_specs:
                        session.add(Specialization(
                            name=sp_name,
                            description=f"{sp_name} consultations, diagnosis, and medical treatment",
                            is_active=True
                        ))
                    await session.commit()
                    logger.info("Seeded initial medical specializations into public master table.")
            except Exception as e:
                await session.rollback()
                logger.error(f"Error seeding initial super admin account: {e}")

    @staticmethod
    async def get_booked_slots_for_date(date: str, doctor_id: Optional[str] = None, tenant_schema: str = "clinic_default") -> List[str]:
        async with AsyncSessionLocal() as session:
            if is_postgres():
                await session.execute(text(f'SET search_path TO "{tenant_schema}", public;'))
            stmt = select(Appointment.time_slot).where(
                and_(
                    Appointment.appointment_date == date,
                    Appointment.status.in_(["CONFIRMED", "COMPLETED"])
                )
            )
            if doctor_id:
                stmt = stmt.where(Appointment.doctor_id == doctor_id)
            result = await session.execute(stmt)
            return [row[0] for row in result.all()]

    @staticmethod
    async def create_appointment(data: Dict[str, Any], tenant_schema: str = "clinic_default") -> Dict[str, Any]:
        async with AsyncSessionLocal() as session:
            try:
                if is_postgres():
                    await session.execute(text(f'SET search_path TO "{tenant_schema}", public;'))
                # Retrieve clinic and doctor for this tenant schema
                clinic_id = data.get("clinic_id")
                clinic = None
                if clinic_id:
                    clinic_res = await session.execute(select(Clinic).where(Clinic.id == clinic_id))
                    clinic = clinic_res.scalar_one_or_none()
                if not clinic:
                    clinic_res = await session.execute(select(Clinic).limit(1))
                    clinic = clinic_res.scalar_one_or_none()
                    if clinic:
                        clinic_id = clinic.id

                tenant_id = data.get("tenant_id") or (clinic.tenant_id if clinic else None) or "tenant_default"
                clinic_name = clinic.name if clinic else settings.DEFAULT_CLINIC_NAME
                clinic_address = clinic.address if clinic else settings.DEFAULT_CLINIC_ADDRESS
                tz_name = clinic.timezone if clinic else settings.DEFAULT_CLINIC_TIMEZONE

                doctor_id = data.get("doctor_id")
                doctor = None
                if doctor_id:
                    doctor_res = await session.execute(select(Doctor).where(Doctor.id == doctor_id))
                    doctor = doctor_res.scalar_one_or_none()
                if not doctor:
                    doctor_res = await session.execute(select(Doctor).where(Doctor.is_active == True).limit(1))
                    doctor = doctor_res.scalar_one_or_none()
                    if doctor:
                        doctor_id = doctor.id

                doctor_name = doctor.name if doctor else settings.DEFAULT_DOCTOR_NAME

                # Parse UTC datetime
                utc_dt = DatabaseService.parse_slot_to_utc(
                    data["date"],
                    data["time_slot"],
                    tz_name=tz_name
                )

                # Ensure patient record exists within this tenant schema
                patient_stmt = select(Patient).where(
                    Patient.mobile_number == data["mobile_number"].strip()
                )
                patient_res = await session.execute(patient_stmt)
                patient = patient_res.scalar_one_or_none()
                if not patient:
                    patient = Patient(
                        full_name=data["patient_name"].strip(),
                        mobile_number=data["mobile_number"].strip()
                    )
                    session.add(patient)
                    await session.flush()

                new_appointment = Appointment(
                    clinic_id=clinic_id,
                    doctor_id=doctor_id,
                    patient_id=patient.id,
                    patient_name=data["patient_name"].strip(),
                    mobile_number=data["mobile_number"].strip(),
                    doctor_name=doctor_name,
                    clinic_name=clinic_name,
                    clinic_address=clinic_address,
                    appointment_date=data["date"],
                    time_slot=data["time_slot"],
                    appointment_datetime=utc_dt,
                    status="CONFIRMED",
                    reminder_sent=False
                )
                session.add(new_appointment)
                await session.flush()
                await session.commit()
                if is_postgres():
                    safe_schema = sanitize_schema_name(tenant_schema)
                    await session.execute(text(f'SET search_path TO "{safe_schema}", public;'))
                try:
                    await session.refresh(new_appointment)
                except Exception:
                    pass

                return {
                    "id": new_appointment.id,
                    "patient_name": new_appointment.patient_name,
                    "mobile_number": new_appointment.mobile_number,
                    "doctor_name": new_appointment.doctor_name,
                    "clinic_name": new_appointment.clinic_name,
                    "clinic_address": new_appointment.clinic_address,
                    "date": new_appointment.appointment_date,
                    "time_slot": new_appointment.time_slot,
                    "status": new_appointment.status,
                    "appointment_datetime": new_appointment.appointment_datetime.isoformat()
                }
            except Exception as e:
                await session.rollback()
                logger.error(f"Failed to create appointment: {e}")
                raise e

    @staticmethod
    async def get_unreminded_appointments_between(window_start: datetime, window_end: datetime) -> List[Dict[str, Any]]:
        async with AsyncSessionLocal() as session:
            stmt = select(Appointment).where(
                and_(
                    Appointment.status == "CONFIRMED",
                    Appointment.reminder_sent == False,
                    Appointment.appointment_datetime >= window_start,
                    Appointment.appointment_datetime <= window_end
                )
            )
            result = await session.execute(stmt)
            appointments = result.scalars().all()
            return [
                {
                    "id": a.id,
                    "patient_name": a.patient_name,
                    "mobile_number": a.mobile_number,
                    "doctor_name": a.doctor_name,
                    "clinic_name": a.clinic_name,
                    "clinic_address": a.clinic_address,
                    "date": a.appointment_date,
                    "time_slot": a.time_slot,
                    "appointment_datetime": a.appointment_datetime
                }
                for a in appointments
            ]

    @staticmethod
    async def mark_reminder_sent(appointment_id: str):
        async with AsyncSessionLocal() as session:
            stmt = select(Appointment).where(Appointment.id == appointment_id)
            res = await session.execute(stmt)
            appt = res.scalar_one_or_none()
            if appt:
                appt.reminder_sent = True
                appt.reminder_sent_at = datetime.now(timezone.utc)
                await session.commit()

    @staticmethod
    async def get_stats(tenant_schema: str = "clinic_default") -> Dict[str, Any]:
        async with AsyncSessionLocal() as session:
            if is_postgres():
                await session.execute(text(f'SET search_path TO "{tenant_schema}", public;'))
            today_str = datetime.now().strftime("%Y-%m-%d")

            total_appts = await session.scalar(select(func.count(Appointment.id)))
            today_appts = await session.scalar(
                select(func.count(Appointment.id)).where(Appointment.appointment_date == today_str)
            )
            confirmed_appts = await session.scalar(
                select(func.count(Appointment.id)).where(Appointment.status == "CONFIRMED")
            )
            cancelled_appts = await session.scalar(
                select(func.count(Appointment.id)).where(Appointment.status == "CANCELLED")
            )
            total_patients = await session.scalar(select(func.count(Patient.id)))
            total_doctors = await session.scalar(select(func.count(Doctor.id)))
            pending_reminders = await session.scalar(
                select(func.count(Appointment.id)).where(
                    and_(Appointment.status == "CONFIRMED", Appointment.reminder_sent == False)
                )
            )

            return {
                "total_appointments": total_appts or 0,
                "today_appointments": today_appts or 0,
                "confirmed_appointments": confirmed_appts or 0,
                "cancelled_appointments": cancelled_appts or 0,
                "total_patients": total_patients or 0,
                "total_doctors": total_doctors or 0,
                "pending_reminders": pending_reminders or 0
            }


db = DatabaseService()
