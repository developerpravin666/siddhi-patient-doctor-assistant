import logging
from datetime import datetime, timedelta, timezone
from app.services.database_service import db
from app.services.whatsapp_service import whatsapp_service
from app.core.security import mask_phone_number

logger = logging.getLogger("reminder_scheduler")


async def check_and_send_1hr_reminders():
    """
    Triggered periodically every 60 seconds by APScheduler.
    Finds confirmed appointments whose appointment_datetime is within the 1-hour window (58-62 min from now).
    Dispatches the official WhatsApp template 'appointment_reminder_1hr'.
    """
    try:
        now_utc = datetime.now(timezone.utc)
        window_start = now_utc + timedelta(minutes=58)
        window_end = now_utc + timedelta(minutes=62)

        logger.debug(f"Checking for reminders in window: {window_start} to {window_end}")
        upcoming = await db.get_unreminded_appointments_between(window_start, window_end)

        for appt in upcoming:
            try:
                masked = mask_phone_number(appt["mobile_number"])
                logger.info(f"Dispatching 1-hour reminder for appointment {appt['id']} to {masked}")

                success = await whatsapp_service.send_template_reminder(
                    recipient_phone=appt["mobile_number"],
                    patient_name=appt["patient_name"],
                    doctor_name=appt["doctor_name"],
                    time_slot=appt["time_slot"],
                    clinic_address=appt["clinic_address"]
                )

                if success:
                    await db.mark_reminder_sent(appt["id"])
                    logger.info(f"Reminder marked as sent for appointment ID {appt['id']}")
            except Exception as e:
                logger.error(f"Error sending reminder for appointment {appt.get('id')}: {e}")

    except Exception as e:
        logger.error(f"Error in check_and_send_1hr_reminders scheduler job: {e}")
