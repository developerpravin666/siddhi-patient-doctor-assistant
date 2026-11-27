import logging
import json
from typing import List, Dict, Any, Tuple, Optional
import pytz
from google import genai
from google.genai import types
from app.core.config import settings
from app.tools.tool_registry import TOOL_DISPATCHER
from app.tools.appointment_tools import (
    get_available_slots,
    book_appointment,
    reschedule_appointment,
    cancel_appointment,
    is_doctor_working_on_date
)
from app.services.database_service import db

logger = logging.getLogger("gemini_service")

def build_system_instruction(
    clinic_name: str = "Medical Clinic",
    doctor_name: str = "the Doctor",
    clinic_address: str = "Clinic Facility",
    clinic_phone: str = "Clinic Support",
    consultation_hours: str = "Regular Operating Hours"
) -> str:
    return f"""
You are the AI Medical Receptionist for {doctor_name} at *{clinic_name}* on WhatsApp.
Your primary role is to help patients schedule, reschedule, and manage appointments swiftly, courteously, and reliably while enforcing strict medical safety guardrails.

PERSONA & TONE:
- Warm, polite, empathetic, yet crisp, reassuring, and professional.
- Channel: WhatsApp. Use WhatsApp formatting (*bold* for emphasis, _italic_ for subtle notes, bullet points or emoji numbers for lists).
- Keep each message under 3 to 4 sentences.
- Ask for ONLY ONE piece of information at a time so the patient is never overwhelmed.

SAFETY GUARDRAILS & POLICIES:
- STRICT NO-MEDICAL-ADVICE POLICY: NEVER diagnose conditions, interpret symptoms, prescribe medications, or recommend treatments.
- EMERGENCY PROTOCOL: If the patient mentions chest pain, severe shortness of breath, heart attack, heavy bleeding, stroke, unconsciousness, poison, severe allergic reaction, or suicidal thoughts:
  Immediately respond with:
  "🚨 *IMPORTANT MEDICAL NOTICE:*\nI am an automated assistant and *cannot provide medical advice or handle medical emergencies*.\n\nIf you or someone else is experiencing severe symptoms, please immediately call *112 / 911 / 108* or visit the nearest hospital emergency room without delay."
- OUT-OF-SCOPE REDIRECT: For topics unrelated to appointments/clinic:
  "I am here specifically to assist you with booking and managing appointments at *{clinic_name}*.\n\nWould you like to check available appointment slots?"
- CLINIC TIMINGS & LOCATION:
  "📍 *Clinic Address:* {clinic_address}\n🕒 *Consultation Hours:* {consultation_hours}\n\nWould you like to book an appointment for tomorrow?"
- HUMAN HAND-OFF: If patient insists on speaking to a doctor immediately or has billing/insurance issues:
  "I have flagged your request for our front-desk reception staff. They will call you shortly at this number during clinic operating hours. You may also reach us directly at *{clinic_phone}*."
"""

SYSTEM_INSTRUCTION = build_system_instruction()


class GeminiService:
    def __init__(self):
        self._client: types.Client = None

    def _get_client(self) -> types.Client:
        if self._client is None and settings.GEMINI_API_KEY and not settings.GEMINI_API_KEY.startswith("AIzaSyYour"):
            try:
                self._client = genai.Client(api_key=settings.GEMINI_API_KEY)
            except Exception as e:
                logger.error(f"Failed to initialize Google GenAI Client: {e}")
        return self._client

    async def _get_upcoming_working_dates(
        self,
        doctor_id: Optional[str],
        target_schema: str,
        max_options: int = 4,
        lookahead_days: int = 21
    ) -> List[Dict[str, str]]:
        """
        Returns up to `max_options` upcoming dates (starting from Today) that are:
        1. Configured working days for the selected doctor (or any active doctor if doctor_id is None).
        2. Have at least 1 open, non-past consultation slot remaining.
        """
        from datetime import datetime, timedelta

        clinic_details = await db.get_clinic_details(tenant_schema=target_schema)
        tz_name = clinic_details.get("timezone") or "Asia/Kolkata"
        try:
            local_tz = pytz.timezone(tz_name)
        except Exception:
            local_tz = pytz.timezone("Asia/Kolkata")

        now_local = datetime.now(local_tz)
        active_doctors = await db.get_active_doctors(tenant_schema=target_schema)

        target_doc = None
        if doctor_id:
            target_doc = next((d for d in active_doctors if d["id"] == doctor_id), None)

        offered_dates: List[Dict[str, str]] = []
        for i in range(0, lookahead_days):
            day_dt = now_local + timedelta(days=i)
            date_str = day_dt.strftime("%Y-%m-%d")

            # Check doctor's configured working days
            if target_doc:
                if not is_doctor_working_on_date(target_doc.get("available_days"), date_str):
                    continue
            elif active_doctors:
                if not any(is_doctor_working_on_date(d.get("available_days"), date_str) for d in active_doctors):
                    continue

            # Check that at least 1 non-past, unbooked slot exists on this day
            slots_res = await get_available_slots(
                date=date_str,
                doctor_id=doctor_id,
                tenant_schema=target_schema
            )
            if not slots_res.get("available_slots"):
                continue

            if i == 0:
                day_label = "Today"
            elif i == 1:
                day_label = "Tomorrow"
            else:
                day_label = day_dt.strftime("%A")

            offered_dates.append({
                "date": date_str,
                "label": f"{day_label} ({day_dt.strftime('%b %d, %Y')})"
            })
            if len(offered_dates) >= max_options:
                break

        return offered_dates

    async def run_turn(
        self,
        user_message: str,
        history: List[Dict[str, Any]],
        session_state: Dict[str, Any]
    ) -> Tuple[str, List[str], Dict[str, Any]]:
        """
        Executes a conversation turn driving the 5-step Patient Appointment State Machine
        with real-time database lookups for clinic profile, doctors, available slots,
        double-booking race-condition prevention, and instant database persistence.
        """
        return await self._conversational_state_machine(user_message, session_state)

    async def _conversational_state_machine(
        self,
        user_message: str,
        session: Dict[str, Any]
    ) -> Tuple[str, List[str], Dict[str, Any]]:
        """
        Full-Stack End-to-End Patient Appointment State Machine Workflow.
        States:
        - WELCOME_MENU: Initial greeting, presenting interactive options (Book / Info / Staff).
        - DOCTOR_SELECTION: If multiple doctors, lists them. If 1 doctor, auto-selects.
        - COLLECT_NAME: Prompts for and validates Patient Full Name.
        - COLLECT_PHONE: Detects webhook phone number for 1-click confirmation or takes new 10-digit number.
        - COLLECT_ADDRESS: Optional residential address collection (with explicit 'Skip').
        - SELECT_DATE: Displays available consultation dates based on doctor schedule.
        - SELECT_TIME_SLOT: Displays open time slots with double-booking verification.
        - CONFIRMATION: Saves to database and sends receipt with Booking ID.
        """
        from datetime import datetime, timedelta
        executed_tools: List[str] = []
        msg_clean = user_message.strip()
        msg_lower = msg_clean.lower()

        target_schema = session.get("tenant_schema") or "public"

        # Check if the user has an existing confirmed upcoming appointment in PostgreSQL
        sender_phone = session.get("sender_phone") or session.get("mobile_number")
        active_appt = None
        if sender_phone:
            active_appt = await db.get_active_appointment_for_phone(sender_phone, tenant_schema=target_schema)

        # 1. Fetch real-time Clinic Profile and Doctor List from Database
        clinic_info = await db.get_clinic_details(target_schema)
        active_doctors = await db.get_active_doctors(target_schema)

        clinic_name = clinic_info.get("name") or settings.DEFAULT_CLINIC_NAME
        clinic_address = clinic_info.get("address") or settings.DEFAULT_CLINIC_ADDRESS
        clinic_phone = clinic_info.get("phone") or settings.DEFAULT_CLINIC_PHONE
        clinic_hours = clinic_info.get("consultation_hours") or "Monday – Saturday: 9:00 AM – 1:00 PM and 4:00 PM – 7:30 PM (Sundays Closed)"
        custom_welcome = None
        if isinstance(clinic_info.get("bot_config"), dict):
            custom_welcome = clinic_info["bot_config"].get("welcome_message")

        primary_doctor_name = active_doctors[0]["name"] if active_doctors else settings.DEFAULT_DOCTOR_NAME
        primary_doctor_specialty = active_doctors[0]["specialty"] if active_doctors else settings.DEFAULT_DOCTOR_SPECIALTY

        # 2. Safety Guardrails: Emergency Protocol (Section 4.1 CAUTION)
        emergency_keywords = [
            "chest pain", "shortness of breath", "heart attack", "heavy bleeding",
            "stroke", "unconscious", "poison", "allergic reaction", "suicidal",
            "cannot breathe", "severe pain", "emergency", "blood"
        ]
        if any(k in msg_lower for k in emergency_keywords):
            reply = (
                "🚨 *IMPORTANT MEDICAL NOTICE:*\n"
                "I am an automated assistant and *cannot provide medical advice or handle medical emergencies*.\n\n"
                "If you or someone else is experiencing severe symptoms, please immediately call *112 / 911 / 108* "
                "or visit the nearest hospital emergency room without delay."
            )
            return reply, executed_tools, session

        # 3. Global Reset / Restart Handling
        if msg_lower in ("restart", "reset", "start over", "menu", "main menu"):
            session.clear()
            session["workflow_state"] = "WELCOME_MENU"
            session["tenant_schema"] = target_schema
            if sender_phone:
                session["sender_phone"] = sender_phone

        # 3b. Global Direct "Reschedule" Trigger
        if any(k in msg_lower for k in ["reschedule appointment", "reschedule", "rescheduling", "change slot", "change time", "change date"]):
            if active_appt:
                session["workflow_state"] = "SELECT_DATE"
                session["is_rescheduling"] = True
                session["reschedule_appt_id"] = active_appt["id"]
                session["doctor_id"] = active_appt["doctor_id"]
                session["doctor_name"] = active_appt["doctor_name"]
                session["patient_name"] = active_appt["patient_name"]
                session["mobile_number"] = active_appt["mobile_number"]

                offered_dates = await self._get_upcoming_working_dates(
                    doctor_id=active_appt["doctor_id"],
                    target_schema=target_schema
                )
                session["offered_dates"] = offered_dates

                emoji_nums = ["1️⃣", "2️⃣", "3️⃣", "4️⃣"]
                date_options = "\n".join([f"{emoji_nums[i]} *{d['label']}*" for i, d in enumerate(offered_dates)])
                reply = (
                    f"🔄 *Rescheduling Appointment with {active_appt['doctor_name']}:*\n\n"
                    f"• *Current:* {active_appt['appointment_date']} at {active_appt['time_slot']}\n\n"
                    f"📅 *Please choose your new preferred date:*\n\n"
                    f"{date_options}\n\n"
                    f"_Reply with 1, 2, 3, 4, or enter a date (YYYY-MM-DD)._"
                )
                return reply, executed_tools, session
            else:
                session["workflow_state"] = "LOOKUP_APPOINTMENT"
                session["lookup_intent"] = "RESCHEDULE"
                reply = (
                    "🔄 *Reschedule Appointment*\n\n"
                    "We could not find an upcoming appointment automatically for this WhatsApp number.\n\n"
                    "Please enter your *10-digit registered mobile number* or *Booking ID* (e.g., 081AB9A6):"
                )
                return reply, executed_tools, session

        # 3c. Global Direct "Cancel" Trigger
        if any(k in msg_lower for k in ["cancel appointment", "cancel booking", "cancel my appointment", "cancelling", "cancel"]):
            if active_appt:
                session["workflow_state"] = "CONFIRM_CANCEL"
                session["cancel_appt_id"] = active_appt["id"]
                session["cancel_appt_info"] = active_appt
                short_id = active_appt["id"][:8].upper()
                reply = (
                    "⚠️ *Cancel Appointment Confirmation:*\n\n"
                    f"Are you sure you want to cancel your consultation with *{active_appt['doctor_name']}* on *{active_appt['appointment_date']} at {active_appt['time_slot']}* (Booking ID: *#{short_id}*)?\n\n"
                    "1️⃣ *Yes, cancel appointment*\n"
                    "2️⃣ *No, keep appointment*\n\n"
                    "_Please reply with 1 or 2._"
                )
                return reply, executed_tools, session
            else:
                session["workflow_state"] = "LOOKUP_APPOINTMENT"
                session["lookup_intent"] = "CANCEL"
                reply = (
                    "⚠️ *Cancel Appointment*\n\n"
                    "We could not find an upcoming appointment automatically for this WhatsApp number.\n\n"
                    "Please enter your *10-digit registered mobile number* or *Booking ID* (e.g., 081AB9A6):"
                )
                return reply, executed_tools, session

        # 4. Global Staff Hand-off check
        if any(k in msg_lower for k in ["speak to doctor", "talk to doctor", "human", "receptionist", "speak to staff"]):
            reply = (
                "I have flagged your request for our front-desk reception staff. "
                "They will call you shortly at this number during clinic operating hours. "
                f"You may also reach us directly at *{clinic_phone}*.\n\n"
                "_Reply *'1'* or *'Book'* anytime to schedule an appointment._"
            )
            return reply, executed_tools, session

        # 5. Global Clinic Timings & Location check
        if any(k in msg_lower for k in ["where are you", "location", "address", "timings", "hours", "clinic open"]):
            reply = (
                f"📍 *Clinic Address:* {clinic_address}\n"
                f"🕒 *Consultation Hours:* {clinic_hours}\n"
                f"📞 *Clinic Contact:* {clinic_phone}\n\n"
                "Would you like to book an appointment? Reply *1* or *'Book'*."
            )
            return reply, executed_tools, session

        # Current State
        state = session.get("workflow_state", "WELCOME_MENU")

        # ---------------------------------------------------------------------
        # STATE 1: WELCOME_MENU
        # ---------------------------------------------------------------------
        if state == "WELCOME_MENU":
            if active_appt:
                # Existing Upcoming Appointment Detected: Present Reschedule / Cancel / Book Another Menu
                short_id = active_appt["id"][:8].upper()
                try:
                    dt_obj = datetime.strptime(active_appt["appointment_date"], "%Y-%m-%d")
                    appt_date_str = dt_obj.strftime("%A, %d %b %Y")
                except Exception:
                    appt_date_str = active_appt["appointment_date"]

                # 1. Option 1: Reschedule
                if msg_lower in ("1", "one", "reschedule", "reschedule appointment", "rescheduling", "change slot", "change time", "change date"):
                    session["workflow_state"] = "SELECT_DATE"
                    session["is_rescheduling"] = True
                    session["reschedule_appt_id"] = active_appt["id"]
                    session["doctor_id"] = active_appt["doctor_id"]
                    session["doctor_name"] = active_appt["doctor_name"]
                    session["patient_name"] = active_appt["patient_name"]
                    session["mobile_number"] = active_appt["mobile_number"]

                    offered_dates = await self._get_upcoming_working_dates(
                        doctor_id=active_appt["doctor_id"],
                        target_schema=target_schema
                    )
                    session["offered_dates"] = offered_dates

                    emoji_nums = ["1️⃣", "2️⃣", "3️⃣", "4️⃣"]
                    date_options = "\n".join([f"{emoji_nums[i]} *{d['label']}*" for i, d in enumerate(offered_dates)])
                    reply = (
                        f"🔄 *Rescheduling Appointment with {active_appt['doctor_name']}:*\n\n"
                        f"• *Current Slot:* {appt_date_str} at {active_appt['time_slot']}\n\n"
                        f"📅 *Please choose your new preferred date:*\n\n"
                        f"{date_options}\n\n"
                        f"_Reply with 1, 2, 3, 4, or enter a specific date (YYYY-MM-DD)._"
                    )
                    return reply, executed_tools, session

                # 2. Option 2: Cancel
                if msg_lower in ("2", "two", "cancel", "cancel appointment", "cancelling"):
                    session["workflow_state"] = "CONFIRM_CANCEL"
                    session["cancel_appt_id"] = active_appt["id"]
                    session["cancel_appt_info"] = active_appt
                    reply = (
                        "⚠️ *Cancel Appointment Confirmation*\n\n"
                        f"Are you sure you want to cancel your consultation with *{active_appt['doctor_name']}* on *{appt_date_str} at {active_appt['time_slot']}* (Booking ID: *#{short_id}*)?\n\n"
                        "1️⃣ *Yes, cancel appointment*\n"
                        "2️⃣ *No, keep appointment*\n\n"
                        "_Please reply with 1 or 2._"
                    )
                    return reply, executed_tools, session

                # 3. Option 3: Book Another Appointment
                if msg_lower in ("3", "three", "book", "new booking", "book another", "book another appointment", "scheduling", "schedule"):
                    session["is_rescheduling"] = False
                    if len(active_doctors) > 1:
                        session["workflow_state"] = "DOCTOR_SELECTION"
                        session["offered_doctors"] = active_doctors
                        emoji_nums = ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣"]
                        doc_options = "\n".join([
                            f"{emoji_nums[i] if i < len(emoji_nums) else f'({i+1})'} *{d['name']}* — _{d['specialty']}_"
                            for i, d in enumerate(active_doctors)
                        ])
                        reply = (
                            "🩺 *Please select a Doctor for your new consultation:*\n\n"
                            f"{doc_options}\n\n"
                            "_Please reply with the doctor's number or name._"
                        )
                        return reply, executed_tools, session
                    else:
                        doc = active_doctors[0] if active_doctors else None
                        doc_name = doc["name"] if doc else primary_doctor_name
                        doc_spec = doc["specialty"] if doc else primary_doctor_specialty
                        session["doctor_id"] = doc["id"] if doc else None
                        session["doctor_name"] = doc_name
                        session["doctor_specialty"] = doc_spec
                        session["workflow_state"] = "COLLECT_NAME"
                        reply = (
                            f"You are booking a new appointment with *{doc_name}* ({doc_spec}).\n\n"
                            "May I please have the patient's *Full Name*?"
                        )
                        return reply, executed_tools, session

                # 4. Option 4: Timings & Location
                if msg_lower in ("4", "four", "timings", "location", "address"):
                    reply = (
                        f"📍 *Clinic Address:* {clinic_address}\n"
                        f"🕒 *Consultation Hours:* {clinic_hours}\n"
                        f"📞 *Clinic Phone:* {clinic_phone}\n\n"
                        "Reply *1* to Reschedule, *2* to Cancel, or *3* to Book another appointment."
                    )
                    return reply, executed_tools, session

                # 5. Option 5: Staff Hand-off
                if msg_lower in ("5", "five", "staff", "receptionist", "speak"):
                    reply = (
                        "Our reception staff will assist you shortly. "
                        f"You can also reach us directly at *{clinic_phone}*.\n\n"
                        "_Reply *1* to Reschedule, *2* to Cancel, or *3* to Book another visit._"
                    )
                    return reply, executed_tools, session

                # Default Greeting with Active Appointment Menu
                reply = (
                    f"👋 Hello *{active_appt['patient_name']}*! Welcome to *{clinic_name}*.\n\n"
                    "📋 *Your Upcoming Appointment:*\n"
                    f"• *Doctor:* {active_appt['doctor_name']}\n"
                    f"• *Date:* {appt_date_str}\n"
                    f"• *Time:* {active_appt['time_slot']}\n"
                    f"• *Booking ID:* #{short_id}\n"
                    f"• *Location:* {active_appt['clinic_address']}\n\n"
                    "How can we assist you today?\n"
                    "1️⃣ *Reschedule Appointment*\n"
                    "2️⃣ *Cancel Appointment*\n"
                    "3️⃣ *Book Another Appointment*\n"
                    "4️⃣ *Clinic Timings & Location*\n"
                    "5️⃣ *Speak with Front Desk Staff*\n\n"
                    "_Please reply with 1, 2, 3, 4, or 5._"
                )
                return reply, executed_tools, session

            else:
                # No Active Appointment: Standard 4-Option Welcome Menu
                is_scheduling_intent = (
                    msg_lower in ("1", "one", "book", "appointment", "schedule", "scheduling", "book appointment", "new booking", "booking")
                    or any(k in msg_lower for k in ["want to book", "need appointment", "consult doctor", "see doctor", "schedule appointment", "scheduling appointment", "book slot", "book a slot"])
                )
                is_manage_intent = (
                    msg_lower in ("2", "two", "reschedule", "rescheduling", "cancel", "cancelling", "modify", "change appointment", "manage")
                    or any(k in msg_lower for k in ["cancel appointment", "reschedule appointment", "cancel booking", "change slot", "modify appointment", "find appointment"])
                )
                is_timings_intent = (
                    msg_lower in ("3", "three", "timings", "location", "address", "hours")
                    or any(k in msg_lower for k in ["where are you", "clinic timing", "clinic hour", "clinic location"])
                )
                is_staff_intent = (
                    msg_lower in ("4", "four", "staff", "receptionist", "speak", "human", "talk")
                    or any(k in msg_lower for k in ["speak to doctor", "talk to doctor", "speak to staff"])
                )

                if is_scheduling_intent:
                    session["is_rescheduling"] = False
                    if len(active_doctors) > 1:
                        session["workflow_state"] = "DOCTOR_SELECTION"
                        session["offered_doctors"] = active_doctors
                        emoji_nums = ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣"]
                        doc_options = "\n".join([
                            f"{emoji_nums[i] if i < len(emoji_nums) else f'({i+1})'} *{d['name']}* — _{d['specialty']}_"
                            for i, d in enumerate(active_doctors)
                        ])
                        reply = (
                            "🩺 *Please select a Doctor for your consultation:*\n\n"
                            f"{doc_options}\n\n"
                            "_Please reply with the doctor's number or name._"
                        )
                        return reply, executed_tools, session
                    elif len(active_doctors) == 1:
                        doc = active_doctors[0]
                        session["doctor_id"] = doc["id"]
                        session["doctor_name"] = doc["name"]
                        session["doctor_specialty"] = doc["specialty"]
                        session["workflow_state"] = "COLLECT_NAME"
                        reply = (
                            f"You are booking an appointment with *{doc['name']}* ({doc['specialty']}).\n\n"
                            "May I please have the patient's *Full Name*?"
                        )
                        return reply, executed_tools, session
                    else:
                        session["doctor_id"] = None
                        session["doctor_name"] = primary_doctor_name
                        session["doctor_specialty"] = primary_doctor_specialty
                        session["workflow_state"] = "COLLECT_NAME"
                        reply = (
                            f"You are booking an appointment with *{primary_doctor_name}* ({primary_doctor_specialty}).\n\n"
                            "May I please have the patient's *Full Name*?"
                        )
                        return reply, executed_tools, session

                if is_manage_intent:
                    session["workflow_state"] = "LOOKUP_APPOINTMENT"
                    session["lookup_intent"] = "GENERAL"
                    reply = (
                        "🔍 *Find Your Appointment*\n\n"
                        "Please enter your *10-digit registered mobile number* or *Booking ID* (e.g., 081AB9A6) to manage your appointment:"
                    )
                    return reply, executed_tools, session

                if is_timings_intent:
                    reply = (
                        f"📍 *Clinic Address:* {clinic_address}\n"
                        f"🕒 *Consultation Hours:* {clinic_hours}\n"
                        f"📞 *Clinic Phone:* {clinic_phone}\n\n"
                        "Reply *1* or *'Book'* to schedule an appointment."
                    )
                    return reply, executed_tools, session

                if is_staff_intent:
                    reply = (
                        "Our reception staff will assist you shortly. "
                        f"You can also reach us directly at *{clinic_phone}*.\n\n"
                        "_Reply *1* anytime to book an appointment online._"
                    )
                    return reply, executed_tools, session

                welcome_header = custom_welcome or f"Hello! 👋 Welcome to *{clinic_name}*."
                reply = (
                    f"{welcome_header}\n\n"
                    "How can we assist you today?\n"
                    "1️⃣ *Book Appointment*\n"
                    "2️⃣ *Reschedule or Cancel Existing Appointment*\n"
                    "3️⃣ *Clinic Timings & Location*\n"
                    "4️⃣ *Speak with Front Desk Staff*\n\n"
                    "_Please reply with 1, 2, 3, or 4._"
                )
                return reply, executed_tools, session

        # ---------------------------------------------------------------------
        # STATE: LOOKUP_APPOINTMENT
        # ---------------------------------------------------------------------
        if state == "LOOKUP_APPOINTMENT":
            if msg_lower in ("menu", "back", "home"):
                session.clear()
                session["workflow_state"] = "WELCOME_MENU"
                session["tenant_schema"] = target_schema
                welcome_header = custom_welcome or f"Hello! 👋 Welcome to *{clinic_name}*."
                reply = (
                    f"{welcome_header}\n\n"
                    "How can we assist you today?\n"
                    "1️⃣ *Book Appointment*\n"
                    "2️⃣ *Reschedule or Cancel Existing Appointment*\n"
                    "3️⃣ *Clinic Timings & Location*\n"
                    "4️⃣ *Speak with Front Desk Staff*\n\n"
                    "_Please reply with 1, 2, 3, or 4._"
                )
                return reply, executed_tools, session

            if msg_lower in ("1", "one", "book", "schedule", "new", "booking", "book appointment", "scheduling"):
                session.clear()
                session["tenant_schema"] = target_schema
                session["is_rescheduling"] = False
                if len(active_doctors) > 1:
                    session["workflow_state"] = "DOCTOR_SELECTION"
                    session["offered_doctors"] = active_doctors
                    emoji_nums = ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣"]
                    doc_options = "\n".join([
                        f"{emoji_nums[i] if i < len(emoji_nums) else f'({i+1})'} *{d['name']}* — _{d['specialty']}_"
                        for i, d in enumerate(active_doctors)
                    ])
                    reply = (
                        "🩺 *Please select a Doctor for your consultation:*\n\n"
                        f"{doc_options}\n\n"
                        "_Please reply with the doctor's number or name._"
                    )
                    return reply, executed_tools, session
                else:
                    doc = active_doctors[0] if active_doctors else None
                    doc_name = doc["name"] if doc else primary_doctor_name
                    doc_spec = doc["specialty"] if doc else primary_doctor_specialty
                    session["doctor_id"] = doc["id"] if doc else None
                    session["doctor_name"] = doc_name
                    session["doctor_specialty"] = doc_spec
                    session["workflow_state"] = "COLLECT_NAME"
                    reply = (
                        f"You are booking an appointment with *{doc_name}* ({doc_spec}).\n\n"
                        "May I please have the patient's *Full Name*?"
                    )
                    return reply, executed_tools, session

            found = await db.get_active_appointment_by_query(msg_clean, tenant_schema=target_schema)
            if not found:
                reply = (
                    f"❌ No active confirmed appointment was found matching *\"{msg_clean}\"*.\n\n"
                    "• Please check and re-enter your *10-digit mobile number* or *Booking ID*\n"
                    "• Or reply *1* to book a new appointment\n"
                    "• Or reply *'Menu'* to return to the main menu"
                )
                return reply, executed_tools, session

            intent = session.get("lookup_intent", "GENERAL")
            short_id = found["id"][:8].upper()

            if intent == "RESCHEDULE":
                session["workflow_state"] = "SELECT_DATE"
                session["is_rescheduling"] = True
                session["reschedule_appt_id"] = found["id"]
                session["doctor_id"] = found.get("doctor_id")
                session["doctor_name"] = found.get("doctor_name", primary_doctor_name)
                session["patient_name"] = found.get("patient_name")
                session["mobile_number"] = found.get("mobile_number")

                offered_dates = await self._get_upcoming_working_dates(
                    doctor_id=active_appt["doctor_id"],
                    target_schema=target_schema
                )
                session["offered_dates"] = offered_dates
                emoji_nums = ["1️⃣", "2️⃣", "3️⃣", "4️⃣"]
                date_options = "\n".join([f"{emoji_nums[i]} *{d['label']}*" for i, d in enumerate(offered_dates)])
                reply = (
                    f"✅ *Found Appointment for {found['patient_name']}!*\n\n"
                    f"• *Current Slot:* {found['appointment_date']} at {found['time_slot']}\n"
                    f"• *Doctor:* {found['doctor_name']}\n"
                    f"• *Booking ID:* #{short_id}\n\n"
                    f"📅 *Please choose your new preferred date:*\n\n"
                    f"{date_options}\n\n"
                    f"_Reply with 1, 2, 3, 4, or enter a date (YYYY-MM-DD)._"
                )
                return reply, executed_tools, session

            elif intent == "CANCEL":
                session["workflow_state"] = "CONFIRM_CANCEL"
                session["cancel_appt_id"] = found["id"]
                session["cancel_appt_info"] = found
                reply = (
                    f"✅ *Found Appointment for {found['patient_name']}!*\n\n"
                    f"Are you sure you want to cancel your consultation with *{found['doctor_name']}* on *{found['appointment_date']} at {found['time_slot']}* (Booking ID: *#{short_id}*)?\n\n"
                    "1️⃣ *Yes, cancel appointment*\n"
                    "2️⃣ *No, keep appointment*\n\n"
                    "_Please reply with 1 or 2._"
                )
                return reply, executed_tools, session

            else:
                session["workflow_state"] = "MANAGE_FOUND_APPOINTMENT"
                session["found_appt"] = found
                reply = (
                    f"📋 *Appointment Found!*\n\n"
                    f"• *Patient:* {found['patient_name']}\n"
                    f"• *Doctor:* {found['doctor_name']}\n"
                    f"• *Date & Time:* {found['appointment_date']} at {found['time_slot']}\n"
                    f"• *Booking ID:* #{short_id}\n\n"
                    "What would you like to do?\n"
                    "1️⃣ *Reschedule to a new date/time*\n"
                    "2️⃣ *Cancel this appointment*\n"
                    "3️⃣ *Keep appointment & return to main menu*\n\n"
                    "_Please reply with 1, 2, or 3._"
                )
                return reply, executed_tools, session

        # ---------------------------------------------------------------------
        # STATE: MANAGE_FOUND_APPOINTMENT
        # ---------------------------------------------------------------------
        if state == "MANAGE_FOUND_APPOINTMENT":
            found = session.get("found_appt") or {}
            short_id = found.get("id", "")[:8].upper()

            if msg_lower in ("1", "one", "reschedule", "change"):
                session["workflow_state"] = "SELECT_DATE"
                session["is_rescheduling"] = True
                session["reschedule_appt_id"] = found.get("id")
                session["doctor_id"] = found.get("doctor_id")
                session["doctor_name"] = found.get("doctor_name", primary_doctor_name)
                session["patient_name"] = found.get("patient_name")
                session["mobile_number"] = found.get("mobile_number")

                offered_dates = await self._get_upcoming_working_dates(
                    doctor_id=active_appt["doctor_id"],
                    target_schema=target_schema
                )
                session["offered_dates"] = offered_dates
                emoji_nums = ["1️⃣", "2️⃣", "3️⃣", "4️⃣"]
                date_options = "\n".join([f"{emoji_nums[i]} *{d['label']}*" for i, d in enumerate(offered_dates)])
                reply = (
                    f"🔄 *Rescheduling Appointment with {found.get('doctor_name')}:*\n\n"
                    f"• *Current Slot:* {found.get('appointment_date')} at {found.get('time_slot')}\n\n"
                    f"📅 *Please choose your new preferred date:*\n\n"
                    f"{date_options}\n\n"
                    f"_Reply with 1, 2, 3, 4, or enter a date (YYYY-MM-DD)._"
                )
                return reply, executed_tools, session

            elif msg_lower in ("2", "two", "cancel"):
                session["workflow_state"] = "CONFIRM_CANCEL"
                session["cancel_appt_id"] = found.get("id")
                session["cancel_appt_info"] = found
                reply = (
                    "⚠️ *Cancel Appointment Confirmation*\n\n"
                    f"Are you sure you want to cancel your consultation with *{found.get('doctor_name')}* on *{found.get('appointment_date')} at {found.get('time_slot')}* (Booking ID: *#{short_id}*)?\n\n"
                    "1️⃣ *Yes, cancel appointment*\n"
                    "2️⃣ *No, keep appointment*\n\n"
                    "_Please reply with 1 or 2._"
                )
                return reply, executed_tools, session

            elif msg_lower in ("3", "three", "keep", "menu", "return"):
                session.clear()
                session["workflow_state"] = "WELCOME_MENU"
                session["tenant_schema"] = target_schema
                reply = (
                    "👍 *Appointment Retained!*\n\n"
                    f"Your appointment with *{found.get('doctor_name')}* on *{found.get('appointment_date')} at {found.get('time_slot')}* remains confirmed.\n\n"
                    "Reply *'Hi'* anytime if you need anything else! 🌿"
                )
                return reply, executed_tools, session
            else:
                reply = (
                    "⚠️ Please choose an option:\n\n"
                    "1️⃣ *Reschedule to a new date/time*\n"
                    "2️⃣ *Cancel this appointment*\n"
                    "3️⃣ *Keep appointment & return to main menu*\n\n"
                    "_Please reply with 1, 2, or 3._"
                )
                return reply, executed_tools, session

        # ---------------------------------------------------------------------
        # STATE 2: DOCTOR_SELECTION
        # ---------------------------------------------------------------------
        if state == "DOCTOR_SELECTION":
            offered = session.get("offered_doctors") or active_doctors
            selected_doc = None

            # 1. Match by numeric option
            for idx, d in enumerate(offered):
                opt_str = str(idx + 1)
                if (msg_clean == opt_str) or (f"option {opt_str}" in msg_lower) or (msg_clean.startswith(opt_str) and len(msg_clean) <= 3):
                    selected_doc = d
                    break

            # 2. Match by doctor name substring
            if not selected_doc:
                for d in offered:
                    doc_surname = d["name"].split()[-1].lower()
                    if doc_surname in msg_lower or d["name"].lower() in msg_lower:
                        selected_doc = d
                        break

            # 3. Match by specialty substring
            if not selected_doc:
                for d in offered:
                    if d.get("specialty") and d["specialty"].lower() in msg_lower:
                        selected_doc = d
                        break

            if selected_doc:
                session["doctor_id"] = selected_doc["id"]
                session["doctor_name"] = selected_doc["name"]
                session["doctor_specialty"] = selected_doc.get("specialty", "General Physician")
                session["workflow_state"] = "COLLECT_NAME"

                reply = (
                    f"Great! You have selected *{selected_doc['name']}* ({session['doctor_specialty']}) 👍\n\n"
                    "May I please have the patient's *Full Name*?"
                )
                return reply, executed_tools, session
            else:
                emoji_nums = ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣"]
                doc_options = "\n".join([
                    f"{emoji_nums[i] if i < len(emoji_nums) else f'({i+1})'} *{d['name']}* — _{d['specialty']}_"
                    for i, d in enumerate(offered)
                ])
                reply = (
                    "⚠️ Please choose a valid doctor by replying with their number or name:\n\n"
                    f"{doc_options}"
                )
                return reply, executed_tools, session

        # ---------------------------------------------------------------------
        # STATE 3: COLLECT_NAME
        # ---------------------------------------------------------------------
        if state == "COLLECT_NAME":
            # Strip common introductory phrases
            cleaned = msg_clean
            for prefix in ["my name is ", "i am ", "i'm ", "this is ", "patient name is ", "name is "]:
                if cleaned.lower().startswith(prefix):
                    cleaned = cleaned[len(prefix):].strip()
                    break

            cleaned = cleaned.replace(".", "").strip().title()

            # Name validation: at least 2 chars, not purely numbers
            if len(cleaned) < 2 or cleaned.isdigit():
                reply = "⚠️ Please provide a valid patient name (e.g. *Rahul Sharma*):"
                return reply, executed_tools, session

            session["patient_name"] = cleaned
            session["workflow_state"] = "COLLECT_PHONE"

            # Check if sender phone was detected from WhatsApp webhook / session
            raw_sender = session.get("sender_phone") or session.get("mobile_number")
            detected_10 = None
            if raw_sender:
                digits_only = "".join(filter(str.isdigit, str(raw_sender)))
                if len(digits_only) >= 10:
                    detected_10 = digits_only[-10:]

            if detected_10:
                session["detected_phone"] = detected_10
                reply = (
                    f"Thank you, *{cleaned}*! 🙏\n\n"
                    f"We detected your WhatsApp phone number: *{detected_10}*.\n"
                    "Would you like to use this number for your appointment confirmation?\n\n"
                    f"• Reply *1* or *'Yes'* to use *{detected_10}*\n"
                    "• Or enter a different *10-digit mobile number*."
                )
                return reply, executed_tools, session
            else:
                reply = (
                    f"Thank you, *{cleaned}*! 🙏\n\n"
                    "Could you please share your *10-digit mobile number* so we can confirm your booking and send appointment updates?"
                )
                return reply, executed_tools, session

        # ---------------------------------------------------------------------
        # STATE 4: COLLECT_PHONE
        # ---------------------------------------------------------------------
        if state == "COLLECT_PHONE":
            detected_10 = session.get("detected_phone")
            final_phone = None

            # User confirms detected number
            if detected_10 and (msg_lower in ("1", "yes", "y", "use this", "confirm", "correct", "sure", "ok")):
                final_phone = detected_10
            else:
                digits = "".join(filter(str.isdigit, msg_clean))
                if len(digits) >= 10:
                    final_phone = digits[-10:]

            if not final_phone:
                reply = "⚠️ Please provide a valid 10-digit mobile number (e.g., *9876543210*):"
                return reply, executed_tools, session

            session["mobile_number"] = final_phone
            session["workflow_state"] = "COLLECT_ADDRESS"

            reply = (
                f"Phone number saved: *{final_phone}* ✅\n\n"
                "Could you please share the patient's *residential address / city*?\n\n"
                "_(Optional — reply *'Skip'* to proceed without address)_"
            )
            return reply, executed_tools, session

        # ---------------------------------------------------------------------
        # STATE 5: COLLECT_ADDRESS
        # ---------------------------------------------------------------------
        if state == "COLLECT_ADDRESS":
            if msg_lower in ("skip", "no", "none", "pass", "na", "n/a", "-", "later", "not now"):
                session["address"] = None
            else:
                session["address"] = msg_clean

            session["workflow_state"] = "SELECT_DATE"

            # Prepare next 4 available working appointment days (including Today if slots remain)
            offered_dates = await self._get_upcoming_working_dates(
                doctor_id=session.get("doctor_id"),
                target_schema=target_schema
            )

            session["offered_dates"] = offered_dates
            doc_display = session.get("doctor_name", primary_doctor_name)

            emoji_nums = ["1️⃣", "2️⃣", "3️⃣", "4️⃣"]
            date_options = "\n".join([
                f"{emoji_nums[i]} *{d['label']}*"
                for i, d in enumerate(offered_dates)
            ])

            reply = (
                f"Got it! 📅 *Please choose your preferred appointment date for {doc_display}:*\n\n"
                f"{date_options}\n\n"
                "_Reply with 1, 2, 3, 4, or enter a specific date (YYYY-MM-DD)._"
            )
            return reply, executed_tools, session

        # ---------------------------------------------------------------------
        # STATE 6: SELECT_DATE
        # ---------------------------------------------------------------------
        if state == "SELECT_DATE":
            offered_dates = session.get("offered_dates", [])
            chosen_date = None

            # 1. Match by numeric option
            for idx, d in enumerate(offered_dates):
                opt_str = str(idx + 1)
                if (msg_clean == opt_str) or (f"option {opt_str}" in msg_lower):
                    chosen_date = d["date"]
                    break

            # 2. Match by relative or day name
            if not chosen_date:
                now = datetime.now()
                if "today" in msg_lower:
                    chosen_date = now.strftime("%Y-%m-%d")
                elif "tomorrow" in msg_lower or "tmrw" in msg_lower:
                    chosen_date = (now + timedelta(days=1)).strftime("%Y-%m-%d")
                else:
                    for d in offered_dates:
                        if d["label"].lower().split()[0] in msg_lower:
                            chosen_date = d["date"]
                            break

            # 3. Direct date string parse (YYYY-MM-DD or DD-MM-YYYY)
            if not chosen_date:
                try:
                    for fmt in ("%Y-%m-%d", "%d-%m-%Y", "%d/%m/%Y"):
                        try:
                            parsed_dt = datetime.strptime(msg_clean, fmt)
                            chosen_date = parsed_dt.strftime("%Y-%m-%d")
                            break
                        except ValueError:
                            continue
                except Exception:
                    pass

            if not chosen_date:
                emoji_nums = ["1️⃣", "2️⃣", "3️⃣", "4️⃣"]
                date_options = "\n".join([
                    f"{emoji_nums[i]} *{d['label']}*"
                    for i, d in enumerate(offered_dates)
                ])
                reply = (
                    "⚠️ Please choose a valid date option (1 to 4) or enter date as YYYY-MM-DD:\n\n"
                    f"{date_options}"
                )
                return reply, executed_tools, session

            # Query real-time available slots for chosen date
            executed_tools.append("get_available_slots")
            doc_id = session.get("doctor_id")
            slots_res = await get_available_slots(
                date=chosen_date,
                doctor_id=doc_id,
                tenant_schema=target_schema
            )

            available_slots = slots_res.get("available_slots", [])
            doc_name = session.get("doctor_name") or slots_res.get("doctor_name") or primary_doctor_name

            # Format date for display
            try:
                dt_obj = datetime.strptime(chosen_date, "%Y-%m-%d")
                display_date = dt_obj.strftime("%A, %b %d, %Y")
            except Exception:
                display_date = chosen_date

            # Edge Case: No slots available on this date
            if not available_slots:
                emoji_nums = ["1️⃣", "2️⃣", "3️⃣", "4️⃣"]
                date_options = "\n".join([
                    f"{emoji_nums[i]} *{d['label']}*"
                    for i, d in enumerate(offered_dates)
                    if d["date"] != chosen_date
                ])
                reply = (
                    f"⚠️ *No consultation slots are available on {display_date}* with *{doc_name}*.\n"
                    "The doctor is fully booked or not consulting on this date.\n\n"
                    "Please select another date from the options below:\n"
                    f"{date_options}"
                )
                return reply, executed_tools, session

            # Slots available: transition to SELECT_TIME_SLOT
            session["selected_date"] = chosen_date
            session["appointment_date"] = chosen_date
            session["offered_slots"] = available_slots[:8]  # Show top 8 slots
            session["workflow_state"] = "SELECT_TIME_SLOT"

            emoji_nums = ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣"]
            slots_display = "\n".join([
                f"{emoji_nums[i]} *{s}*"
                for i, s in enumerate(session["offered_slots"])
            ])

            reply = (
                f"🕒 *Available Consultation Slots for {display_date}*:\n"
                f"Doctor: *{doc_name}*\n\n"
                f"{slots_display}\n\n"
                "_Please reply with the slot number (e.g. 1) or preferred time (e.g. 10:30 AM)._"
            )
            return reply, executed_tools, session

        # ---------------------------------------------------------------------
        # STATE 7: SELECT_TIME_SLOT
        # ---------------------------------------------------------------------
        if state == "SELECT_TIME_SLOT":
            offered_slots = session.get("offered_slots", [])
            chosen_slot = None

            # 1. Match numeric option
            for idx, s in enumerate(offered_slots):
                opt_str = str(idx + 1)
                if (msg_clean == opt_str) or (f"option {opt_str}" in msg_lower):
                    chosen_slot = s
                    break

            # 2. Match exact time string or substring e.g. "10:30", "10:30 AM", "4:30"
            if not chosen_slot:
                for s in offered_slots:
                    clean_s = s.lower().replace("am", "").replace("pm", "").strip()
                    if clean_s in msg_lower or s.lower() in msg_lower:
                        chosen_slot = s
                        break

            if not chosen_slot:
                emoji_nums = ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣"]
                slots_display = "\n".join([
                    f"{emoji_nums[i]} *{s}*"
                    for i, s in enumerate(offered_slots)
                ])
                reply = (
                    "⚠️ Please reply with a valid slot number from the list (e.g. *1*) or time (e.g. *10:30 AM*):\n\n"
                    f"{slots_display}"
                )
                return reply, executed_tools, session

            # 3. Race condition verification & double-booking prevention in Database
            if session.get("is_rescheduling") and session.get("reschedule_appt_id"):
                executed_tools.append("reschedule_appointment")
                reschedule_res = await reschedule_appointment(
                    appointment_id=session["reschedule_appt_id"],
                    date=session["selected_date"],
                    time_slot=chosen_slot,
                    tenant_schema=target_schema
                )

                if reschedule_res.get("status") == "SLOT_TAKEN":
                    refreshed = await get_available_slots(
                        date=session["selected_date"],
                        doctor_id=session.get("doctor_id"),
                        tenant_schema=target_schema
                    )
                    new_slots = refreshed.get("available_slots", [])
                    session["offered_slots"] = new_slots[:8]
                    emoji_nums = ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣"]
                    slots_display = "\n".join([f"{emoji_nums[i]} *{s}*" for i, s in enumerate(new_slots[:8])])
                    reply = (
                        f"⚠️ *Slot Just Taken!*\n"
                        f"The slot *{chosen_slot}* was just booked by another patient.\n\n"
                        "Please choose from the remaining available slots:\n"
                        f"{slots_display}"
                    )
                    return reply, executed_tools, session

                short_id = session["reschedule_appt_id"][:8].upper()
                try:
                    dt_obj = datetime.strptime(session["selected_date"], "%Y-%m-%d")
                    display_date = dt_obj.strftime("%A, %d %B %Y")
                except Exception:
                    display_date = session["selected_date"]

                doc_display = reschedule_res.get("doctor_name") or session.get("doctor_name") or primary_doctor_name
                old_info = f" (previously {reschedule_res.get('old_date', '')} at {reschedule_res.get('old_time', '')})" if reschedule_res.get("old_date") else ""

                reply = (
                    "🎉 *Appointment Successfully Rescheduled!*\n\n"
                    f"• *Booking ID:* #{short_id}\n"
                    f"• *Patient:* {session['patient_name']}\n"
                    f"• *Phone:* {session['mobile_number']}\n"
                    f"• *Doctor:* {doc_display}\n"
                    f"• *New Date:* {display_date}\n"
                    f"• *New Time:* {chosen_slot}\n"
                    f"• *Clinic:* {clinic_name}\n"
                    f"• *Location:* {clinic_address}\n\n"
                    "⏰ *Reminder Notice:* You will receive an automated WhatsApp reminder *1 hour before* your rescheduled consultation.\n\n"
                    "_Need to make any further changes? Just reply *'Hi'* anytime!_ 🌿"
                )

                session.clear()
                session["workflow_state"] = "WELCOME_MENU"
                session["tenant_schema"] = target_schema
                return reply, executed_tools, session

            # Standard New Booking
            executed_tools.append("book_appointment")
            booking_res = await book_appointment(
                patient_name=session["patient_name"],
                mobile_number=session["mobile_number"],
                date=session["selected_date"],
                time_slot=chosen_slot,
                doctor_id=session.get("doctor_id"),
                address=session.get("address"),
                tenant_schema=target_schema
            )

            # Slot was taken by concurrent booking
            if booking_res.get("status") == "SLOT_TAKEN":
                # Refresh remaining available slots
                refreshed = await get_available_slots(
                    date=session["selected_date"],
                    doctor_id=session.get("doctor_id"),
                    tenant_schema=target_schema
                )
                new_slots = refreshed.get("available_slots", [])
                session["offered_slots"] = new_slots[:8]
                emoji_nums = ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣"]
                slots_display = "\n".join([f"{emoji_nums[i]} *{s}*" for i, s in enumerate(new_slots[:8])])
                reply = (
                    f"⚠️ *Slot Just Taken!*\n"
                    f"The slot *{chosen_slot}* was just booked by another patient.\n\n"
                    "Please choose from the remaining available slots:\n"
                    f"{slots_display}"
                )
                return reply, executed_tools, session

            # 4. Success: Format Final Confirmation Summary
            appt_id = booking_res.get("appointment_id", "APT-SUCCESS")
            short_id = appt_id[:8].upper() if len(appt_id) >= 8 else appt_id

            try:
                dt_obj = datetime.strptime(session["selected_date"], "%Y-%m-%d")
                display_date = dt_obj.strftime("%A, %d %B %Y")
            except Exception:
                display_date = session["selected_date"]

            doc_display = booking_res.get("doctor_name") or session.get("doctor_name") or primary_doctor_name
            spec_display = session.get("doctor_specialty") or primary_doctor_specialty
            addr_line = f"\n• *Address:* {session['address']}" if session.get("address") else ""

            reply = (
                "🎉 *Appointment Confirmed!*\n\n"
                f"• *Booking ID:* #{short_id}\n"
                f"• *Patient:* {session['patient_name']}\n"
                f"• *Phone:* {session['mobile_number']}{addr_line}\n"
                f"• *Doctor:* {doc_display} ({spec_display})\n"
                f"• *Date:* {display_date}\n"
                f"• *Time:* {chosen_slot}\n"
                f"• *Clinic:* {clinic_name}\n"
                f"• *Location:* {clinic_address}\n\n"
                "⏰ *Reminder Notice:* You will receive an automated WhatsApp reminder *1 hour before* your consultation.\n\n"
                "_Need to book another appointment or make changes? Just reply *'Hi'* anytime!_ 🌿"
            )

            # Reset state for subsequent new conversations
            session.clear()
            session["workflow_state"] = "WELCOME_MENU"
            session["tenant_schema"] = target_schema
            return reply, executed_tools, session

        # ---------------------------------------------------------------------
        # STATE: CONFIRM_CANCEL
        # ---------------------------------------------------------------------
        if state == "CONFIRM_CANCEL":
            cancel_info = session.get("cancel_appt_info") or {}
            doc_name = cancel_info.get("doctor_name") or "the doctor"
            appt_date = cancel_info.get("appointment_date") or ""
            appt_time = cancel_info.get("time_slot") or ""
            appt_id = session.get("cancel_appt_id") or cancel_info.get("id")

            if msg_lower in ("1", "one", "yes", "confirm", "cancel", "yes cancel"):
                executed_tools.append("cancel_appointment")
                cancel_res = await cancel_appointment(appt_id, tenant_schema=target_schema)
                reply = (
                    "✅ *Appointment Cancelled Successfully*\n\n"
                    f"Your consultation with *{doc_name}* on *{appt_date} at {appt_time}* has been cancelled, and the time slot has been released.\n\n"
                    "Whenever you're ready to book again, simply reply *'Hi'* or *'Book'* anytime! Wishing you good health! 🌿"
                )
                session.clear()
                session["workflow_state"] = "WELCOME_MENU"
                session["tenant_schema"] = target_schema
                return reply, executed_tools, session
            elif msg_lower in ("2", "two", "no", "keep", "don't cancel", "dont cancel"):
                reply = (
                    "👍 *Appointment Retained!*\n\n"
                    f"Your consultation with *{doc_name}* remains confirmed for *{appt_date} at {appt_time}*.\n\n"
                    "We look forward to seeing you! Reply *'Hi'* anytime if you need anything else. 🌿"
                )
                session.clear()
                session["workflow_state"] = "WELCOME_MENU"
                session["tenant_schema"] = target_schema
                return reply, executed_tools, session
            else:
                reply = (
                    "⚠️ Please choose an option:\n\n"
                    "1️⃣ *Yes, cancel appointment*\n"
                    "2️⃣ *No, keep appointment*\n\n"
                    "_Reply with 1 or 2._"
                )
                return reply, executed_tools, session

        # Fallback reset if unexpected state
        session.clear()
        session["workflow_state"] = "WELCOME_MENU"
        reply = (
            f"Hello! 👋 Welcome to *{clinic_name}*.\n\n"
            "How can we help you today?\n"
            "1️⃣ *Book Appointment*\n"
            "2️⃣ *Clinic Timings & Location*\n"
            "3️⃣ *Speak with Staff*\n\n"
            "_Reply with 1, 2, or 3._"
        )
        return reply, executed_tools, session


gemini_service = GeminiService()
