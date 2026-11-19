import logging
from datetime import datetime, timezone
from typing import List, Optional, Dict, Any
import pytz
from dateutil import parser
from sqlalchemy import select, and_, func
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import AsyncSessionLocal
from app.core.config import settings
from app.core.security import get_password_hash
from app.models.domain import Tenant, Clinic, Doctor, Patient, Appointment, AdminUser

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
        Ensures default Tenant, Clinic, Doctor, and AdminUser exist.
        """
        async with AsyncSessionLocal() as session:
            try:
                # 1. Tenant
                result = await session.execute(select(Tenant).limit(1))
                tenant = result.scalar_one_or_none()
                if not tenant:
                    tenant = Tenant(
                        id="tenant_default",
                        name="Siddhi Healthcare Group",
                        status="ACTIVE"
                    )
                    session.add(tenant)
                    await session.flush()
                    logger.info("Seeded default tenant.")

                # 2. Clinic
                result = await session.execute(select(Clinic).limit(1))
                clinic = result.scalar_one_or_none()
                if not clinic:
                    clinic = Clinic(
                        id="clinic_default",
                        tenant_id=tenant.id,
                        name=settings.DEFAULT_CLINIC_NAME,
                        address=settings.DEFAULT_CLINIC_ADDRESS,
                        phone=settings.DEFAULT_CLINIC_PHONE,
                        timezone=settings.DEFAULT_CLINIC_TIMEZONE,
                        consultation_hours="Monday - Saturday: 9:00 AM - 1:00 PM, 4:00 PM - 7:30 PM (Sundays Closed)"
                    )
                    session.add(clinic)
                    await session.flush()
                    logger.info("Seeded default clinic.")

                # 3. Doctor
                result = await session.execute(select(Doctor).limit(1))
                doctor = result.scalar_one_or_none()
                if not doctor:
                    doctor = Doctor(
                        id="doctor_default",
                        clinic_id=clinic.id,
                        name=settings.DEFAULT_DOCTOR_NAME,
                        specialty=settings.DEFAULT_DOCTOR_SPECIALTY,
                        available_days="Mon,Tue,Wed,Thu,Fri,Sat",
                        morning_slots="09:00 AM,09:30 AM,10:00 AM,10:30 AM,11:00 AM,11:30 AM,12:00 PM,12:30 PM",
                        evening_slots="04:00 PM,04:30 PM,05:00 PM,05:30 PM,06:00 PM,06:30 PM,07:00 PM",
                        is_active=True
                    )
                    session.add(doctor)
                    await session.flush()
                    logger.info("Seeded default doctor.")

                # 4. Admin User
                result = await session.execute(select(AdminUser).where(AdminUser.username == "admin"))
                admin = result.scalar_one_or_none()
                if not admin:
                    admin = AdminUser(
                        username="admin",
                        hashed_password=get_password_hash("admin123"),
                        full_name="Dr. Siddhi Patel Admin",
                        role="SUPER_ADMIN",
                        tenant_id=tenant.id,
                        is_active=True
                    )
                    session.add(admin)
                    logger.info("Seeded default admin user (admin / admin123).")

                await session.commit()
            except Exception as e:
                await session.rollback()
                logger.error(f"Error seeding default database entities: {e}")

    @staticmethod
    async def get_booked_slots_for_date(date: str, doctor_id: Optional[str] = None) -> List[str]:
        async with AsyncSessionLocal() as session:
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
    async def create_appointment(data: Dict[str, Any]) -> Dict[str, Any]:
        async with AsyncSessionLocal() as session:
            try:
                # Retrieve default clinic and doctor if not provided
                clinic_id = data.get("clinic_id") or "clinic_default"
                doctor_id = data.get("doctor_id") or "doctor_default"
                tenant_id = data.get("tenant_id") or "tenant_default"

                clinic_res = await session.execute(select(Clinic).where(Clinic.id == clinic_id))
                clinic = clinic_res.scalar_one_or_none()
                clinic_name = clinic.name if clinic else settings.DEFAULT_CLINIC_NAME
                clinic_address = clinic.address if clinic else settings.DEFAULT_CLINIC_ADDRESS
                tz_name = clinic.timezone if clinic else settings.DEFAULT_CLINIC_TIMEZONE

                doctor_res = await session.execute(select(Doctor).where(Doctor.id == doctor_id))
                doctor = doctor_res.scalar_one_or_none()
                doctor_name = doctor.name if doctor else settings.DEFAULT_DOCTOR_NAME

                # Parse UTC datetime
                utc_dt = DatabaseService.parse_slot_to_utc(
                    data["date"],
                    data["time_slot"],
                    tz_name=tz_name
                )

                # Ensure patient record exists
                patient_stmt = select(Patient).where(
                    and_(
                        Patient.tenant_id == tenant_id,
                        Patient.mobile_number == data["mobile_number"].strip()
                    )
                )
                patient_res = await session.execute(patient_stmt)
                patient = patient_res.scalar_one_or_none()
                if not patient:
                    patient = Patient(
                        tenant_id=tenant_id,
                        full_name=data["patient_name"].strip(),
                        mobile_number=data["mobile_number"].strip()
                    )
                    session.add(patient)
                    await session.flush()

                new_appointment = Appointment(
                    tenant_id=tenant_id,
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
                await session.commit()
                await session.refresh(new_appointment)

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
    async def get_stats() -> Dict[str, Any]:
        async with AsyncSessionLocal() as session:
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
