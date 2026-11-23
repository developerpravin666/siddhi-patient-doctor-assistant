from datetime import datetime, timedelta
import logging
from typing import Dict, Any, List, Optional
from sqlalchemy import select, and_, text
from app.core.database import AsyncSessionLocal, is_postgres
from app.models.domain import Doctor, Appointment, Clinic
from app.services.database_service import db

logger = logging.getLogger("appointment_tools")


def generate_slots_by_interval(start_hour: int, start_min: int, end_hour: int, end_min: int, interval_mins: int = 15) -> List[str]:
    """
    Generates time slot strings based on start/end times and doctor-configured interval (5, 10, 15, 20, 30 mins).
    """
    interval = max(5, interval_mins)
    slots = []
    curr = datetime(2000, 1, 1, start_hour, start_min)
    end = datetime(2000, 1, 1, end_hour, end_min)
    while curr < end:
        slots.append(curr.strftime("%I:%M %p"))
        curr += timedelta(minutes=interval)
    return slots


async def get_available_slots(
    date: str,
    doctor_id: Optional[str] = None,
    tenant_schema: str = "public"
) -> Dict[str, Any]:
    """
    Queries open doctor appointment time slots dynamically from the database
    based on doctor schedules and configured time difference (5, 10, 15, 30 min).

    Args:
        date: Target appointment date in 'YYYY-MM-DD' format (or 'today', 'tomorrow').
        doctor_id: Optional doctor ID to query specific schedule.
        tenant_schema: Isolated clinic tenant schema.
    """
    now = datetime.now()
    if not date or date.lower() in ("tomorrow", "tmrw"):
        target_date = (now + timedelta(days=1)).strftime("%Y-%m-%d")
    elif date.lower() == "today":
        target_date = now.strftime("%Y-%m-%d")
    else:
        try:
            target_date = datetime.strptime(date.strip(), "%Y-%m-%d").strftime("%Y-%m-%d")
        except Exception:
            target_date = (now + timedelta(days=1)).strftime("%Y-%m-%d")

    target_weekday = datetime.strptime(target_date, "%Y-%m-%d").strftime("%A").lower()

    # 1. Fetch doctor(s) schedule dynamically from database
    configured_slots: List[str] = []
    doctor_name: Optional[str] = None
    doctor_specialty: Optional[str] = None
    doctor_available_today = False
    safe_schema = await db.resolve_schema(tenant_schema)

    async with AsyncSessionLocal() as session:
        try:
            if is_postgres():
                await session.execute(text(f'SET search_path TO "{safe_schema}", public;'))

            stmt = select(Doctor).where(Doctor.is_active == True)
            if doctor_id:
                stmt = stmt.where(Doctor.id == doctor_id)

            res = await session.execute(stmt)
            doctors = res.scalars().all()

            for doc in doctors:
                # Check doctor available days (e.g. "Monday, Wednesday, Friday" or "Mon-Sat")
                days_str = (doc.available_days or "Monday - Saturday").lower()
                is_available = False
                if "daily" in days_str or "all" in days_str or "everyday" in days_str:
                    is_available = True
                elif "mon-sat" in days_str or "monday - saturday" in days_str or "monday to saturday" in days_str:
                    is_available = target_weekday != "sunday"
                elif "mon-fri" in days_str or "monday - friday" in days_str or "monday to friday" in days_str:
                    is_available = target_weekday not in ("saturday", "sunday")
                else:
                    is_available = target_weekday[:3] in days_str or target_weekday in days_str

                if not is_available and len(doctors) == 1:
                    # Doctor explicitly not available on this day
                    doctor_name = doc.name
                    doctor_specialty = doc.specialty
                    continue

                doctor_available_today = True
                doc_slots = []
                # Use doctor configured morning & evening slots if present
                if doc.morning_slots and doc.morning_slots.strip():
                    doc_slots.extend([s.strip() for s in doc.morning_slots.split(",") if s.strip()])
                else:
                    # Auto-generate based on doctor's slot_duration_minutes (e.g. 5, 10, 15, 30 min)
                    interval = doc.slot_duration_minutes or 30
                    doc_slots.extend(generate_slots_by_interval(9, 0, 13, 0, interval))

                if doc.evening_slots and doc.evening_slots.strip():
                    doc_slots.extend([s.strip() for s in doc.evening_slots.split(",") if s.strip()])
                else:
                    interval = doc.slot_duration_minutes or 30
                    doc_slots.extend(generate_slots_by_interval(16, 0, 19, 30, interval))

                configured_slots.extend(doc_slots)
                if not doctor_name:
                    doctor_name = doc.name
                    doctor_specialty = doc.specialty

        except Exception as e:
            logger.warning(f"Error querying doctors from database for slots: {e}")

    # Fallback to standard slots ONLY if doctor is marked available or no specific doctor configured
    if not configured_slots and doctor_available_today:
        configured_slots = [
            "09:00 AM", "09:30 AM", "10:00 AM", "10:30 AM",
            "11:00 AM", "11:30 AM", "12:00 PM", "12:30 PM",
            "04:00 PM", "04:30 PM", "05:00 PM", "05:30 PM",
            "06:00 PM", "06:30 PM", "07:00 PM"
        ]

    # Deduplicate while preserving order
    unique_slots = list(dict.fromkeys(configured_slots))

    # 2. Fetch already booked slots from the database
    booked_slots = await db.get_booked_slots_for_date(target_date, doctor_id=doctor_id, tenant_schema=tenant_schema)

    # 3. Filter out already booked slots
    open_slots = [slot for slot in unique_slots if slot not in booked_slots]

    logger.info(f"Dynamic database-driven slots for {target_date} (doctor: {doctor_id or 'all'}): {len(open_slots)} available")

    return {
        "status": "SUCCESS",
        "date": target_date,
        "doctor_id": doctor_id,
        "doctor_name": doctor_name,
        "doctor_specialty": doctor_specialty,
        "available_slots": open_slots,
        "total_available": len(open_slots)
    }


async def book_appointment(
    patient_name: str,
    mobile_number: str,
    date: str,
    time_slot: str,
    doctor_id: Optional[str] = None,
    clinic_id: Optional[str] = None,
    address: Optional[str] = None,
    tenant_schema: str = "public"
) -> Dict[str, Any]:
    """
    Confirms and saves the appointment to the database with double-booking prevention.
    """
    now = datetime.now()
    if not date or date.lower() in ("tomorrow", "tmrw"):
        target_date = (now + timedelta(days=1)).strftime("%Y-%m-%d")
    elif date.lower() == "today":
        target_date = now.strftime("%Y-%m-%d")
    else:
        try:
            target_date = datetime.strptime(date.strip(), "%Y-%m-%d").strftime("%Y-%m-%d")
        except Exception:
            target_date = (now + timedelta(days=1)).strftime("%Y-%m-%d")

    logger.info(f"Executing book_appointment for {patient_name} on {target_date} at {time_slot} (doctor: {doctor_id})")

    result = await db.create_appointment({
        "patient_name": patient_name.strip(),
        "mobile_number": mobile_number.strip(),
        "date": target_date,
        "time_slot": time_slot.strip(),
        "doctor_id": doctor_id,
        "clinic_id": clinic_id,
        "address": address,
        "status": "CONFIRMED"
    }, tenant_schema=tenant_schema)

    if result.get("status") == "SLOT_TAKEN":
        return result

    return {
        "status": "SUCCESS",
        "appointment_id": result["id"],
        "patient_name": result["patient_name"],
        "mobile_number": result["mobile_number"],
        "doctor_name": result["doctor_name"],
        "clinic_name": result["clinic_name"],
        "clinic_address": result["clinic_address"],
        "date": result["date"],
        "time_slot": result["time_slot"],
        "appointment_datetime": result["appointment_datetime"]
    }


async def reschedule_appointment(
    appointment_id: str,
    date: str,
    time_slot: str,
    tenant_schema: str = "public"
) -> Dict[str, Any]:
    """
    Reschedules an existing appointment to a new date and time slot.
    """
    now = datetime.now()
    if not date or date.lower() in ("tomorrow", "tmrw"):
        target_date = (now + timedelta(days=1)).strftime("%Y-%m-%d")
    elif date.lower() == "today":
        target_date = now.strftime("%Y-%m-%d")
    else:
        try:
            target_date = datetime.strptime(date.strip(), "%Y-%m-%d").strftime("%Y-%m-%d")
        except Exception:
            target_date = (now + timedelta(days=1)).strftime("%Y-%m-%d")

    return await db.reschedule_appointment(
        appointment_id=appointment_id,
        new_date=target_date,
        new_time_slot=time_slot.strip(),
        tenant_schema=tenant_schema
    )


async def cancel_appointment(
    appointment_id: str,
    tenant_schema: str = "public"
) -> Dict[str, Any]:
    """
    Cancels an existing appointment and frees up the slot.
    """
    return await db.cancel_appointment(
        appointment_id=appointment_id,
        tenant_schema=tenant_schema
    )
