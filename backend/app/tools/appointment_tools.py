from datetime import datetime, timedelta
import logging
from typing import Dict, Any, List
from app.services.database_service import db

logger = logging.getLogger("appointment_tools")


async def get_available_slots(date: str) -> Dict[str, Any]:
    """
    Queries open 30-minute doctor appointment time slots for a given date.

    Args:
        date: Target appointment date in 'YYYY-MM-DD' format (or 'today', 'tomorrow').
    """
    # Normalize relative date strings
    now = datetime.now()
    if not date or date.lower() in ("tomorrow", "tmrw"):
        target_date = (now + timedelta(days=1)).strftime("%Y-%m-%d")
    elif date.lower() == "today":
        target_date = now.strftime("%Y-%m-%d")
    else:
        try:
            # Validate format
            target_date = datetime.strptime(date.strip(), "%Y-%m-%d").strftime("%Y-%m-%d")
        except Exception:
            target_date = (now + timedelta(days=1)).strftime("%Y-%m-%d")

    # Fetch already booked slots from the database
    booked_slots = await db.get_booked_slots_for_date(target_date)

    all_slots = [
        "10:00 AM", "10:30 AM", "11:15 AM", "04:30 PM", "05:15 PM",
        "09:00 AM", "09:30 AM", "11:00 AM", "04:00 PM", "05:00 PM", "06:00 PM"
    ]

    # Filter out already booked slots
    open_slots = [slot for slot in all_slots if slot not in booked_slots]

    # Return top 3 to 5 clear slots
    selected_slots = open_slots[:5]

    logger.info(f"Available slots for {target_date}: {selected_slots}")

    return {
        "status": "SUCCESS",
        "date": target_date,
        "available_slots": selected_slots,
        "count": len(selected_slots)
    }


async def book_appointment(patient_name: str, mobile_number: str, date: str, time_slot: str) -> Dict[str, Any]:
    """
    Confirms and saves the appointment to the database and schedules a reminder.

    Args:
        patient_name: Full name of the patient.
        mobile_number: 10-digit mobile phone number.
        date: Appointment date in 'YYYY-MM-DD' format.
        time_slot: Confirmed time slot (e.g. '10:30 AM').
    """
    # Normalize relative dates
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

    logger.info(f"Executing book_appointment for {patient_name} on {target_date} at {time_slot}")

    result = await db.create_appointment({
        "patient_name": patient_name.strip(),
        "mobile_number": mobile_number.strip(),
        "date": target_date,
        "time_slot": time_slot.strip(),
        "status": "CONFIRMED"
    })

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
