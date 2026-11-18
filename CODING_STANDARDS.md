# Production Coding Standards & Architecture Specification

**Project:** Siddhi Patient-Doctor Assistant (Multi-Tenant AI Receptionist)  
**Target Architecture:** Multi-Tenant Backend (Python FastAPI recommended / .NET 8 Alternative), React Admin Portal, Meta WhatsApp Cloud API, Google Gemini API (Function Calling).

---

## 1. Technology Stack Recommendation: Python (FastAPI) vs .NET 8

| Criterion | Python (FastAPI + Pydantic v2 + AsyncIO) | .NET 8 / 9 (ASP.NET Core Web API) | Verdict & Recommendation |
| :--- | :--- | :--- | :--- |
| **Gemini AI Integration** | Native First-Party Google GenAI SDK (`google-genai`), immediate zero-day tool calling support, native async stream handlers. | Semantic Kernel or raw HttpClient REST bindings. More boilerplate required for dynamic tool schemas. | **Python Winner**: Streamlined AI ecosystem and official SDKs. |
| **WhatsApp Webhook Handling** | Non-blocking async endpoints with `uvicorn`, fast JSON serialization with `orjson` / `pydantic`. | High throughput Kestrel server, strongly-typed POCO mapping. | **Tie**: Both handle thousands of req/sec easily. |
| **Session & Multi-Tenant State** | Redis Async (`redis-py`) + Pydantic session models, lightweight memory footprints. | Redis (`StackExchange.Redis`) + EF Core multi-tenant global query filters. | **Tie**: .NET excels at enterprise DB filtering, Python excels at flexible LLM state. |
| **Scheduler for Reminders** | APScheduler (AsyncIOScheduler) or Celery + Redis Beat. | Hangfire or Quartz.NET background hosted services. | **Tie**: Both have rock-solid enterprise scheduling. |
| **Admin Frontend Integration** | Standard REST / OpenAPI 3.1 schema auto-generation. | OpenAPI / Swagger schema auto-generation. | **Tie**. |

> **Primary Architectural Recommendation:**  
> Use **Python 3.11+ with FastAPI** as the primary backend service for the AI WhatsApp Agent & Webhook engine. It offers first-class support for Gemini Function Calling, rapid prototyping, concise async event loops, and lower operational overhead. For enterprise C# requirements, the .NET 8 architectural pattern is specified in Section 8.

---

## 2. System Architecture & Directory Structure

```plaintext
siddhi-patient-doctor-assistant/
├── backend/
│   ├── app/
│   │   ├── api/
│   │   │   ├── v1/
│   │   │   │   ├── webhook.py          # WhatsApp GET (verification) & POST (events)
│   │   │   │   ├── admin.py            # Admin REST endpoints (clinics, tenants, appointments)
│   │   │   │   └── appointments.py     # Direct appointment CRUD
│   │   ├── core/
│   │   │   ├── config.py           # Pydantic BaseSettings (.env loading)
│   │   │   ├── security.py         # WhatsApp webhook signature validator & JWT
│   │   │   └── database.py         # SQLAlchemy / Motor DB async session factory
│   │   ├── models/
│   │   │   ├── domain.py           # Tenant, Clinic, Doctor, Patient, Appointment entities
│   │   │   └── schemas.py          # Pydantic input/output schemas
│   │   ├── services/
│   │   │   ├── gemini_service.py   # Gemini API client, system instructions & tool execution
│   │   │   ├── whatsapp_service.py # WhatsApp Cloud API sender (Text, Lists, Templates)
│   │   │   ├── session_service.py  # Redis-backed temporary session memory (TTL 30m)
│   │   │   └── reminder_service.py # 1-Hour automated reminder dispatcher
│   │   ├── tools/
│   │   │   ├── appointment_tools.py# Gemini tools: get_available_slots, book_appointment
│   │   │   └── tool_registry.py    # Declarations and dispatcher for Gemini tools
│   │   └── main.py                 # FastAPI application factory & scheduler startup
│   ├── requirements.txt
│   ├── Dockerfile
│   └── .env.example
├── frontend/                       # React Admin Portal (Vite + TS + Tailwind)
│   ├── src/
│   │   ├── components/             # Reusable UI widgets
│   │   ├── pages/                  # Super Admin, Clinic Dashboard, Appointments, Patients
│   │   ├── hooks/                  # TanStack Query & auth hooks
│   │   └── api/                    # Axios API client
│   ├── package.json
│   └── vite.config.ts
├── CODING_STANDARDS.md             # This document
├── BUSINESS_FLOW.md                # Conversational guide & receptionist rules
└── .env.example                    # Root environment configuration
```

---

## 3. Webhook Specification (WhatsApp Cloud API)

### 3.1 Verification Endpoint (`GET /webhook`)
Meta sends a GET request to verify your webhook during setup.

```python
# app/api/v1/webhook.py
from fastapi import APIRouter, Query, Response, status, Request, HTTPException
from app.core.config import settings
import logging

router = APIRouter()
logger = logging.getLogger("webhook")

@router.get("/webhook")
async def verify_webhook(
    hub_mode: str = Query(None, alias="hub.mode"),
    hub_verify_token: str = Query(None, alias="hub.verify_token"),
    hub_challenge: str = Query(None, alias="hub.challenge"),
):
    if hub_mode == "subscribe" and hub_verify_token == settings.WHATSAPP_VERIFY_TOKEN:
        logger.info("WhatsApp webhook verified successfully.")
        return Response(content=hub_challenge, media_type="text/plain", status_code=status.HTTP_200_OK)
    
    logger.warning("Webhook verification failed: Invalid verify token.")
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Verification token mismatch")
```

### 3.2 Inbound Message Receiver (`POST /webhook`)
- Must acknowledge Meta immediately with `200 OK` (under 2 seconds) to avoid retries.
- Dispatches long-running Gemini interaction and tool execution to background tasks.
- Validates the `X-Hub-Signature-256` payload signature for security.

```python
# app/api/v1/webhook.py
from fastapi import BackgroundTasks

@router.post("/webhook")
async def receive_whatsapp_event(request: Request, background_tasks: BackgroundTasks):
    # 1. Verify HMAC SHA-256 signature
    signature = request.headers.get("X-Hub-Signature-256", "")
    body_bytes = await request.body()
    if not security.verify_whatsapp_signature(body_bytes, signature, settings.WHATSAPP_APP_SECRET):
        raise HTTPException(status_code=401, detail="Invalid signature")

    payload = await request.json()
    
    # 2. Extract message & ignore status notifications (sent, delivered, read)
    entry = payload.get("entry", [{}])[0]
    changes = entry.get("changes", [{}])[0]
    value = changes.get("value", {})
    messages = value.get("messages", [])
    
    if not messages:
        return {"status": "ignored_non_message_event"}

    message = messages[0]
    from_number = message.get("from")  # E.g. "919876543210"
    message_type = message.get("type")
    
    text_content = ""
    if message_type == "text":
        text_content = message.get("text", {}).get("body", "").strip()
    elif message_type == "interactive":
        # Supports button and list replies
        interactive_data = message.get("interactive", {})
        if interactive_data.get("type") == "button_reply":
            text_content = interactive_data.get("button_reply", {}).get("title", "")
        elif interactive_data.get("type") == "list_reply":
            text_content = interactive_data.get("list_reply", {}).get("title", "")

    if from_number and text_content:
        # Offload AI orchestration to background worker to prevent WhatsApp timeout
        background_tasks.add_task(
            orchestration_pipeline.process_user_message,
            phone_number=from_number,
            message_text=text_content
        )

    return {"status": "queued"}
```

---

## 4. Session Memory & Multi-Turn History

Maintain conversation history and partial slots per user phone number in Redis with an auto-expiring TTL (default: 30 minutes).

### Data Structure in Redis:
- Key: `session:{phone_number}`
- Value (JSON):
```json
{
  "patient_name": "Rahul Sharma",
  "mobile_number": "9876543210",
  "selected_date": "2026-11-19",
  "selected_slot": "10:30 AM",
  "clinic_id": "clinic_01",
  "history": [
    {"role": "user", "parts": ["Hi, I want to book an appointment."]},
    {"role": "model", "parts": ["Hello! Welcome to Dr. Sharma's Clinic. May I please have your full name?"]}
  ],
  "last_interaction": 1731945600
}
```

```python
# app/services/session_service.py
import json
import redis.asyncio as aioredis
from app.core.config import settings

redis_client = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
SESSION_TTL_SECONDS = 1800  # 30 minutes

class SessionService:
    @staticmethod
    async def get_session(phone_number: str) -> dict:
        raw = await redis_client.get(f"session:{phone_number}")
        if raw:
            return json.loads(raw)
        return {
            "patient_name": None,
            "mobile_number": None,
            "selected_date": None,
            "selected_slot": None,
            "clinic_id": "default_clinic",
            "history": []
        }

    @staticmethod
    async def save_session(phone_number: str, data: dict):
        await redis_client.setex(
            f"session:{phone_number}",
            SESSION_TTL_SECONDS,
            json.dumps(data)
        )
```

---

## 5. Gemini Function Calling Implementation

Gemini is configured with two callable tools using the official `google-genai` SDK:
1. `get_available_slots(date: str)`
2. `book_appointment(patient_name: str, mobile_number: str, date: str, time_slot: str)`

### 5.1 Tool Function Definitions & Execution
```python
# app/tools/appointment_tools.py
from datetime import datetime
from app.services.database_service import db

async def get_available_slots(date: str) -> dict:
    """
    Queries open 30-minute doctor appointment time slots for a given date.
    
    Args:
        date: Target appointment date in 'YYYY-MM-DD' format.
    """
    # Fetch booked appointments from DB
    booked_slots = await db.get_booked_slots_for_date(date)
    
    all_slots = [
        "09:00 AM", "09:30 AM", "10:00 AM", "10:30 AM", "11:00 AM",
        "04:00 PM", "04:30 PM", "05:00 PM", "05:30 PM", "06:00 PM"
    ]
    
    # Filter out already booked slots
    open_slots = [slot for slot in all_slots if slot not in booked_slots]
    
    return {
        "date": date,
        "available_slots": open_slots[:5], # Return 3-5 top slots
        "count": len(open_slots)
    }

async def book_appointment(patient_name: str, mobile_number: str, date: str, time_slot: str) -> dict:
    """
    Confirms and saves the appointment to the database and schedules a reminder.
    
    Args:
        patient_name: Full name of the patient.
        mobile_number: 10-digit mobile phone number.
        date: Appointment date in 'YYYY-MM-DD' format.
        time_slot: Confirmed time slot (e.g. '10:30 AM').
    """
    appointment_id = await db.create_appointment({
        "patient_name": patient_name.strip(),
        "mobile_number": mobile_number.strip(),
        "date": date,
        "time_slot": time_slot,
        "status": "CONFIRMED",
        "doctor_name": "Dr. Siddhi Patel",
        "clinic_name": "Siddhi Health Clinic",
        "clinic_address": "Suite 402, Medical Enclave, Central Avenue",
        "created_at": datetime.utcnow().isoformat(),
        "reminder_sent": False
    })
    
    return {
        "status": "SUCCESS",
        "appointment_id": appointment_id,
        "patient_name": patient_name,
        "doctor_name": "Dr. Siddhi Patel",
        "date": date,
        "time_slot": time_slot,
        "clinic_address": "Suite 402, Medical Enclave, Central Avenue"
    }
```

### 5.2 Gemini Client & Orchestration Loop
```python
# app/services/gemini_service.py
from google import genai
from google.genai import types
from app.core.config import settings
from app.tools.appointment_tools import get_available_slots, book_appointment

client = genai.Client(api_key=settings.GEMINI_API_KEY)

TOOL_DISPATCHER = {
    "get_available_slots": get_available_slots,
    "book_appointment": book_appointment,
}

SYSTEM_INSTRUCTION = """
You are a polite, professional medical receptionist assistant for Dr. Siddhi Patel at Siddhi Health Clinic on WhatsApp.
Your sole job is to help patients book appointments quickly.
Follow the strict conversational guide:
1. Greet and ask for their Full Name.
2. Ask for their 10-digit Mobile Number.
3. Call `get_available_slots` for today or tomorrow and present 3-5 clear slots.
4. When selected, call `book_appointment`.
5. Provide a clear booking confirmation with Doctor, Date, Time, Address, and note that a 1-hour WhatsApp reminder will be sent.
Do not provide medical advice. For emergencies, instruct user to go to the nearest hospital.
"""

async def run_conversation_turn(user_message: str, history: list) -> str:
    # Build contents with function calling enabled
    chat = client.chats.create(
        model="gemini-2.5-flash",
        config=types.GenerateContentConfig(
            system_instruction=SYSTEM_INSTRUCTION,
            temperature=0.2,
            tools=[get_available_slots, book_appointment]
        ),
        history=history
    )
    
    response = chat.send_message(user_message)
    
    # Check if tool calling was triggered
    while response.function_calls:
        for call in response.function_calls:
            tool_name = call.name
            tool_args = call.args
            
            tool_fn = TOOL_DISPATCHER.get(tool_name)
            if tool_fn:
                tool_result = await tool_fn(**tool_args)
            else:
                tool_result = {"error": f"Tool {tool_name} not found"}
            
            # Send tool response back to Gemini to synthesize natural reply
            response = chat.send_message(
                types.Part.from_function_response(
                    name=tool_name,
                    response={"result": tool_result}
                )
            )
            
    return response.text
```

---

## 6. 1-Hour Reminder Scheduler Specification

Runs periodically every **60 seconds** via APScheduler or Celery Beat.

### 6.1 Logic:
1. Scan for appointments where:
   - `status == "CONFIRMED"`
   - `reminder_sent == False`
   - `appointment_datetime` is between **58 minutes** and **62 minutes** from current server time (UTC).
2. For each matching appointment:
   - Send Meta WhatsApp template message (`appointment_reminder_1hr`).
   - Mark `reminder_sent = True` to prevent duplicate messaging.
   - Log delivery audit trail.

```python
# app/services/reminder_service.py
from datetime import datetime, timedelta
import asyncio
from app.services.database_service import db
from app.services.whatsapp_service import send_whatsapp_template
import logging

logger = logging.getLogger("scheduler")

async def check_and_send_1hr_reminders():
    """Triggered every minute by APScheduler"""
    now = datetime.now()
    window_start = now + timedelta(minutes=58)
    window_end = now + timedelta(minutes=62)
    
    upcoming = await db.get_unreminded_appointments_between(window_start, window_end)
    
    for appt in upcoming:
        try:
            # WhatsApp Cloud API requires approved template for business-initiated triggers
            payload = {
                "template_name": "appointment_reminder_1hr",
                "recipient_phone": appt["mobile_number"],
                "parameters": [
                    {"type": "text", "text": appt["patient_name"]},
                    {"type": "text", "text": appt["doctor_name"]},
                    {"type": "text", "text": appt["time_slot"]},
                    {"type": "text", "text": appt["clinic_address"]}
                ]
            }
            success = await send_whatsapp_template(payload)
            if success:
                await db.mark_reminder_sent(appt["id"])
                logger.info(f"Reminder sent for appointment {appt['id']} to {appt['mobile_number']}")
        except Exception as e:
            logger.error(f"Failed to send reminder for appointment {appt['id']}: {e}")
```

---

## 7. Multi-Tenant React Admin Portal Architecture

Super Admins and Clinic Admins manage tenants, clinics, doctors, time slots, and live appointment queues.

### 7.1 Architecture & Role-Based Access Control (RBAC):
- **Super Admin:** Create/Suspend Tenants, Manage Subscriptions, Global Analytics.
- **Tenant / Clinic Admin:** Configure Clinic Profile, Doctors, Weekly Schedules, Buffer Times, WhatsApp Credentials.
- **Receptionist / Staff:** View Live Calendar, Manually Book/Reschedule/Cancel, Patient Search.

### 7.2 Recommended Frontend Stack:
- **Framework:** React 18+ with TypeScript (Vite bundler)
- **State Management & Server State:** TanStack Query (React Query) v5 + Zustand for local UI state
- **UI & Styling:** Tailwind CSS + Shadcn UI (Radix Primitives)
- **Calendar & Appointments:** FullCalendar React or DayPicker
- **Data Table:** TanStack Table v8 with pagination, filtering, and export to CSV/Excel

---

## 8. Alternative Backend: .NET 8 Web API Standards

If .NET 8 / 9 is required:
- **Framework:** ASP.NET Core Minimal APIs or Web API Controllers with C# 12.
- **AI Integration:** Google Semantic Kernel connector or typed `HttpClient` calling `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent`.
- **Background Tasks:** `IHostedService` with `PeriodicTimer(TimeSpan.FromMinutes(1))` or **Hangfire** with Redis storage.
- **Database:** Entity Framework Core 8 with multi-tenant `HasQueryFilter(e => e.TenantId == _tenantProvider.TenantId)`.
- **WhatsApp Webhook:** Standard controller with `[FromQuery(Name = "hub.mode")]` and HMAC SHA-256 validation via `HMACSHA256` cryptography provider.

---

## 9. Security, Operational Rules & Best Practices

1. **WhatsApp Webhook Security:** Always compute HMAC SHA-256 on raw payload bytes using `WHATSAPP_APP_SECRET` and compare in constant time (`hmac.compare_digest`).
2. **PII Protection:** Never log raw patient mobile numbers or medical queries in plain text. Mask phone numbers (`******3210`) in application logs.
3. **Idempotency:** WhatsApp Cloud API may send duplicate event notifications. Maintain a `processed_message_ids` set in Redis with 24-hour TTL.
4. **Timezone Handling:** Always store appointment times in UTC in the database, with a localized `clinic_timezone` (e.g., `Asia/Kolkata`) field for formatting messages and computing 1-hour reminders.
5. **Rate Limiting:** Protect admin endpoints with Redis-based sliding window rate limits.
