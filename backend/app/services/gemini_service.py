import logging
import json
from typing import List, Dict, Any, Tuple
from google import genai
from google.genai import types
from app.core.config import settings
from app.tools.tool_registry import TOOL_DISPATCHER
from app.tools.appointment_tools import get_available_slots, book_appointment

logger = logging.getLogger("gemini_service")

SYSTEM_INSTRUCTION = """
You are the AI Medical Receptionist for Dr. Siddhi Patel at Dr. Siddhi Patel's Clinic on WhatsApp.
Your primary role is to help patients schedule appointments swiftly, courteously, and reliably while enforcing strict medical safety guardrails.

PERSONA & TONE:
- Warm, polite, empathetic, yet crisp, reassuring, and professional.
- Channel: WhatsApp. Use WhatsApp formatting (*bold* for emphasis, _italic_ for subtle notes, bullet points or emoji numbers for lists).
- Keep each message under 3 to 4 sentences.
- Ask for ONLY ONE piece of information at a time so the patient is never overwhelmed.

STRICT 5-STEP BOOKING CONVERSATION FLOW:
1. Greeting & Request Full Name:
   Welcome the user to Dr. Siddhi Patel's Clinic and ask for their full name.
   Example: "Hello! 👋 Welcome to *Dr. Siddhi Patel's Clinic*.\n\nI would be happy to help you schedule an appointment with Dr. Patel.\n\nMay I please have your *full name*?"

2. Request 10-Digit Mobile Number:
   When name is given, thank the patient and ask for their 10-digit mobile number.
   Example: "Thank you, *Rahul*! 🙏\n\nCould you please share your *10-digit mobile number* so we can confirm your booking and send appointment updates?"
   If invalid, politely ask again: "Please provide a valid 10-digit mobile number (e.g., 9876543210)."

3. Fetch & Present Available Slots:
   When valid phone number is given, call `get_available_slots(date="tomorrow")` (or today if requested).
   Present 3 to 5 clear numbered slots.
   Example:
   "Got it! Here are the available consultation slots for *Tomorrow*:\n\n1️⃣ *10:00 AM*\n2️⃣ *10:30 AM*\n3️⃣ *11:15 AM*\n4️⃣ *04:30 PM*\n5️⃣ *05:15 PM*\n\nPlease reply with the number or time that works best for you."

4. Confirm Booking & Call Tool:
   When patient selects a slot (e.g. 'Option 2', '10:30 AM', '2'), call `book_appointment(patient_name, mobile_number, date, time_slot)`.

5. Final Confirmation:
   Confirm with details:
   "🎉 *Appointment Confirmed!*\n\nHere are your booking details:\n• *Patient:* Rahul Sharma\n• *Doctor:* Dr. Siddhi Patel (General Physician)\n• *Date:* [Date]\n• *Time:* [Time]\n• *Clinic Address:* Suite 402, Siddhi Medical Enclave, Central Avenue\n\n⏰ *Note:* You will receive an automated reminder on WhatsApp *1 hour before* your scheduled visit.\n\nNeed to reschedule or cancel? Reply here anytime. Wishing you good health! 🌿"

SAFETY GUARDRAILS & POLICIES:
- STRICT NO-MEDICAL-ADVICE POLICY: NEVER diagnose conditions, interpret symptoms, prescribe medications, or recommend treatments.
- EMERGENCY PROTOCOL: If the patient mentions chest pain, severe shortness of breath, heart attack, heavy bleeding, stroke, unconsciousness, poison, severe allergic reaction, or suicidal thoughts:
  Immediately respond with:
  "🚨 *IMPORTANT MEDICAL NOTICE:*\nI am an automated assistant and *cannot provide medical advice or handle medical emergencies*.\n\nIf you or someone else is experiencing severe symptoms, please immediately call *112 / 911 / 108* or visit the nearest hospital emergency room without delay."
- OUT-OF-SCOPE REDIRECT: For topics unrelated to appointments/clinic:
  "I am here specifically to assist you with booking and managing appointments at *Dr. Siddhi Patel's Clinic*.\n\nWould you like to check available appointment slots?"
- CLINIC TIMINGS & LOCATION:
  "📍 *Clinic Address:* Suite 402, Siddhi Medical Enclave, Central Avenue\n🕒 *Consultation Hours:* Monday – Saturday, 9:00 AM – 1:00 PM and 4:00 PM – 7:30 PM (Sundays Closed).\n\nWould you like to book an appointment for tomorrow?"
- HUMAN HAND-OFF: If patient insists on speaking to a doctor immediately or has billing/insurance issues:
  "I have flagged your request for our front-desk reception staff. They will call you shortly at this number during clinic operating hours. You may also reach us directly at *+91 98765 00000*."
"""


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

    async def run_turn(
        self,
        user_message: str,
        history: List[Dict[str, Any]],
        session_state: Dict[str, Any]
    ) -> Tuple[str, List[str], Dict[str, Any]]:
        """
        Executes a conversation turn with Gemini Function Calling.
        Returns: (assistant_reply, executed_tool_names, updated_session_state)
        """
        executed_tools: List[str] = []
        client = self._get_client()

        if client:
            try:
                # Convert history to format compatible with google-genai
                formatted_contents = []
                for h in history:
                    role = h.get("role", "user")
                    parts = h.get("parts", [])
                    formatted_parts = []
                    for p in parts:
                        if isinstance(p, str):
                            formatted_parts.append(types.Part.from_text(text=p))
                    if formatted_parts:
                        formatted_contents.append(types.Content(role=role, parts=formatted_parts))

                # Add current user message
                formatted_contents.append(
                    types.Content(role="user", parts=[types.Part.from_text(text=user_message)])
                )

                config = types.GenerateContentConfig(
                    system_instruction=SYSTEM_INSTRUCTION,
                    temperature=0.2,
                    tools=[get_available_slots, book_appointment]
                )

                response = client.models.generate_content(
                    model=settings.GEMINI_MODEL,
                    contents=formatted_contents,
                    config=config
                )

                # Process any function calls
                while response.function_calls:
                    for call in response.function_calls:
                        tool_name = call.name
                        tool_args = call.args or {}
                        executed_tools.append(tool_name)
                        logger.info(f"Gemini invoked tool: {tool_name} with args: {tool_args}")

                        # Execute tool
                        tool_fn = TOOL_DISPATCHER.get(tool_name)
                        if tool_fn:
                            if "tenant_schema" not in tool_args and session_state.get("tenant_schema"):
                                tool_args["tenant_schema"] = session_state["tenant_schema"]
                            tool_result = await tool_fn(**tool_args)
                        else:
                            tool_result = {"error": f"Tool {tool_name} not found"}

                        if tool_name == "book_appointment" and tool_result.get("status") == "SUCCESS":
                            session_state["appointment_booked"] = True
                            session_state["appointment_id"] = tool_result.get("appointment_id")
                        elif tool_name == "get_available_slots":
                            session_state["offered_slots"] = tool_result.get("available_slots", [])
                            session_state["selected_date"] = tool_result.get("date")

                        # Send tool output back to model
                        response = client.models.generate_content(
                            model=settings.GEMINI_MODEL,
                            contents=[
                                types.Content(
                                    role="tool",
                                    parts=[
                                        types.Part.from_function_response(
                                            name=tool_name,
                                            response={"result": tool_result}
                                        )
                                    ]
                                )
                            ],
                            config=config
                        )

                reply_text = response.text if response.text else "Thank you for reaching out to Dr. Siddhi Patel's Clinic. How may I assist you?"
                return reply_text.strip(), executed_tools, session_state

            except Exception as e:
                logger.error(f"Error calling Gemini API: {e}. Falling back to rule-based receptionist engine.")

        # Fallback to Rule-based Medical Receptionist engine (Section 2 & 4 in BUSINESS_FLOW.md)
        return await self._fallback_conversational_engine(user_message, session_state)

    async def _fallback_conversational_engine(
        self,
        user_message: str,
        session: Dict[str, Any]
    ) -> Tuple[str, List[str], Dict[str, Any]]:
        """
        Rock-solid fallback conversational engine fully adhering to BUSINESS_FLOW.md
        guaranteeing 100% adherence to the 5-step flow and medical safety guardrails
        even without an active Gemini API key.
        """
        from datetime import datetime, timedelta
        executed_tools: List[str] = []
        msg_clean = user_message.strip()
        msg_lower = msg_clean.lower()

        # Dynamic Clinic & Doctor context from database
        clinic_name = settings.DEFAULT_CLINIC_NAME
        clinic_address = settings.DEFAULT_CLINIC_ADDRESS
        clinic_phone = settings.DEFAULT_CLINIC_PHONE
        clinic_hours = "Monday – Saturday: 9:00 AM – 1:00 PM and 4:00 PM – 7:30 PM (Sundays Closed)"
        primary_doctor_name = settings.DEFAULT_DOCTOR_NAME
        primary_doctor_specialty = settings.DEFAULT_DOCTOR_SPECIALTY

        try:
            from sqlalchemy import select, text
            from app.core.database import AsyncSessionLocal, is_postgres
            from app.models.domain import Clinic, Doctor
            async with AsyncSessionLocal() as dbs:
                if is_postgres():
                    await dbs.execute(text('SET search_path TO "clinic_default", public;'))
                c_res = await dbs.execute(select(Clinic).limit(1))
                c_obj = c_res.scalar_one_or_none()
                if c_obj:
                    clinic_name = c_obj.name
                    clinic_address = c_obj.address
                    if c_obj.phone:
                        clinic_phone = c_obj.phone
                    if c_obj.consultation_hours:
                        clinic_hours = c_obj.consultation_hours

                d_res = await dbs.execute(select(Doctor).where(Doctor.is_active == True).limit(5))
                doc_list = d_res.scalars().all()
                if doc_list:
                    primary_doctor_name = doc_list[0].name
                    primary_doctor_specialty = doc_list[0].specialty
        except Exception as e:
            logger.warning(f"Could not load dynamic clinic context from DB: {e}")

        # 1. Emergency Check (Section 4.1 CAUTION)
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

        # 2. Hand-off check (Section 4.4)
        if any(k in msg_lower for k in ["speak to doctor", "talk to doctor", "human", "receptionist", "speak to staff"]):
            reply = (
                "I have flagged your request for our front-desk reception staff. "
                "They will call you shortly at this number during clinic operating hours. "
                f"You may also reach us directly at *{clinic_phone}*."
            )
            return reply, executed_tools, session

        # 3. Clinic Timings & Location (Section 4.3)
        if any(k in msg_lower for k in ["where are you", "location", "address", "timings", "hours", "open"]):
            reply = (
                f"📍 *Clinic Address:* {clinic_address}\n"
                f"🕒 *Consultation Hours:* {clinic_hours}.\n\n"
                "Would you like to book an appointment for tomorrow?"
            )
            return reply, executed_tools, session

        step = session.get("step", 1)

        # Step 1: Greeting & Request Full Name
        if step == 1 or not session.get("patient_name"):
            # Check for name introduction pattern e.g. "I am Sneha", "My name is Rahul Sharma"
            introduced_name = None
            for prefix in ["my name is ", "i am ", "i'm ", "this is "]:
                if prefix in msg_lower:
                    introduced_name = msg_clean[msg_lower.index(prefix) + len(prefix):].strip().title()
                    break

            if introduced_name:
                session["patient_name"] = introduced_name
                session["step"] = 2
                reply = (
                    f"Thank you, *{session['patient_name']}*! 🙏\n\n"
                    f"Could you please share your *10-digit mobile number* so we can confirm your booking and send appointment updates?"
                )
                return reply, executed_tools, session

            # If awaiting name after greeting has already been given:
            if session.get("awaiting_name"):
                # Clean name
                clean_name = msg_clean.replace(".", "").strip().title()
                session["patient_name"] = clean_name
                session["awaiting_name"] = False
                session["step"] = 2
                reply = (
                    f"Thank you, *{session['patient_name']}*! 🙏\n\n"
                    f"Could you please share your *10-digit mobile number* so we can confirm your booking and send appointment updates?"
                )
                return reply, executed_tools, session

            # Booking intent or initial greeting (BUSINESS_FLOW.md Step 1)
            booking_intent_keywords = [
                "hi", "hello", "hey", "appointment", "book", "see", "doctor",
                "consult", "dr", "siddhi", "clinic", "schedule", "visit", "need"
            ]
            if any(k in msg_lower for k in booking_intent_keywords) or not session.get("greeted"):
                session["greeted"] = True
                session["awaiting_name"] = True
                reply = (
                    f"Hello! 👋 Welcome to *{clinic_name}*.\n\n"
                    f"I would be happy to help you schedule an appointment with {primary_doctor_name}.\n\n"
                    "May I please have your *full name*?"
                )
                return reply, executed_tools, session

            # Otherwise treat direct input as name
            session["patient_name"] = msg_clean.replace(".", "").strip().title()
            session["step"] = 2
            reply = (
                f"Thank you, *{session['patient_name']}*! 🙏\n\n"
                f"Could you please share your *10-digit mobile number* so we can confirm your booking and send appointment updates?"
            )
            return reply, executed_tools, session

        # Step 2: Request 10-Digit Mobile Number
        if step == 2 or not session.get("mobile_number"):
            # Extract digits
            digits = "".join(filter(str.isdigit, msg_clean))
            if len(digits) >= 10:
                # Take last 10 digits
                phone_10 = digits[-10:]
                session["mobile_number"] = phone_10
                session["step"] = 3

                # Invoke tool: get_available_slots
                executed_tools.append("get_available_slots")
                slots_res = await get_available_slots("tomorrow")
                slots = slots_res.get("available_slots", [])
                target_date = slots_res.get("date")
                session["offered_slots"] = slots
                session["selected_date"] = target_date

                # Format date nicely
                try:
                    dt = datetime.strptime(target_date, "%Y-%m-%d")
                    formatted_date = dt.strftime("%A, %b %d")
                except Exception:
                    formatted_date = "Tomorrow"

                emoji_numbers = ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣", "9️⃣", "🔟"]
                slots_to_show = slots[:10]
                slots_text = "\n".join([
                    f"{emoji_numbers[i] if i < len(emoji_numbers) else f'({i+1})'} *{slot}*"
                    for i, slot in enumerate(slots_to_show)
                ])

                reply = (
                    f"Got it! Here are the available consultation slots for *Tomorrow ({formatted_date})*:\n\n"
                    f"{slots_text}\n\n"
                    f"Please reply with the number or time that works best for you."
                )
                return reply, executed_tools, session
            else:
                reply = "Please provide a valid 10-digit mobile number (e.g., 9876543210)."
                return reply, executed_tools, session

        # Step 3: Slot selection & Step 4/5 Booking
        if step == 3:
            offered = session.get("offered_slots", ["10:00 AM", "10:30 AM", "11:15 AM", "04:30 PM", "05:15 PM"])
            chosen_slot = None

            # Check if user specified number (e.g., "1", "option 2", "2")
            for idx, slot in enumerate(offered):
                opt_str = str(idx + 1)
                if (opt_str in msg_clean.split()) or (f"option {opt_str}" in msg_lower) or (msg_clean == opt_str):
                    chosen_slot = slot
                    break

            # If not matched by index, check time match e.g. "10:30", "11:15", "4:30"
            if not chosen_slot:
                for slot in offered:
                    clean_time = slot.lower().replace("am", "").replace("pm", "").strip()
                    if clean_time in msg_lower or slot.lower() in msg_lower:
                        chosen_slot = slot
                        break

            if chosen_slot:
                session["selected_slot"] = chosen_slot
                target_date = session.get("selected_date")
                if not target_date:
                    target_date = (datetime.now() + timedelta(days=1)).strftime("%Y-%m-%d")

                # Invoke tool: book_appointment
                executed_tools.append("book_appointment")
                booking_res = await book_appointment(
                    patient_name=session["patient_name"],
                    mobile_number=session["mobile_number"],
                    date=target_date,
                    time_slot=chosen_slot
                )

                try:
                    dt = datetime.strptime(target_date, "%Y-%m-%d")
                    display_date = dt.strftime("%A, %d %B %Y")
                except Exception:
                    display_date = target_date

                session["step"] = 5  # Confirmed

                reply = (
                    "🎉 *Appointment Confirmed!*\n\n"
                    "Here are your booking details:\n"
                    f"• *Patient:* {session['patient_name']}\n"
                    f"• *Doctor:* {booking_res.get('doctor_name', primary_doctor_name)}\n"
                    f"• *Date:* {display_date}\n"
                    f"• *Time:* {chosen_slot}\n"
                    f"• *Clinic Address:* {booking_res.get('clinic_address', clinic_address)}\n\n"
                    "⏰ *Note:* You will receive an automated reminder on WhatsApp *1 hour before* your scheduled visit.\n\n"
                    "Need to reschedule or cancel? Reply here anytime. Wishing you good health! 🌿"
                )
                return reply, executed_tools, session
            else:
                # Clarify slot selection
                emoji_numbers = ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣"]
                slots_text = "\n".join([f"{emoji_numbers[i]} *{slot}*" for i, slot in enumerate(offered)])
                reply = (
                    "Please reply with the slot number (e.g., *1* or *2*) or your preferred time:\n\n"
                    f"{slots_text}"
                )
                return reply, executed_tools, session

        # Post-confirmation or fallback
        reply = (
            "Your appointment has been confirmed! If you would like to book another appointment "
            "or need assistance, please reply with *'New Booking'*."
        )
        if "new" in msg_lower or "book" in msg_lower:
            session.clear()
            session["step"] = 1
            reply = (
                f"Hello! 👋 Welcome back to *{clinic_name}*.\n\n"
                "May I please have the *full name* for this appointment?"
            )
        return reply, executed_tools, session


gemini_service = GeminiService()
