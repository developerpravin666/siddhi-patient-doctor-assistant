# Siddhi Patient-Doctor Assistant

An automated, multi-tenant AI Medical Receptionist integrating **Meta WhatsApp Cloud API**, **Google Gemini API (Function Calling)**, and a modern **React Admin Portal** to streamline doctor appointment bookings swiftly, courteously, and reliably.

---

## 📚 Core Architecture & Business Guides

1. **[Coding Standards & Architecture Guide](file:///d:/Pravin/Projects/siddhi-patient-doctor-assistant/CODING_STANDARDS.md)**
   - Technology Stack: Python FastAPI + Pydantic v2 + SQLAlchemy (Async) + Redis
   - Meta WhatsApp Cloud API Webhook verification (`GET /webhook`) & event receiver (`POST /webhook`)
   - 30-minute auto-expiring session memory in Redis
   - Gemini Function Calling tools (`get_available_slots`, `book_appointment`)
   - APScheduler 1-hour automated WhatsApp reminder background worker
   - Multi-tenant React Admin Portal (React 18 + Vite + Tailwind CSS)
   - Security: HMAC SHA-256 webhook signature validation, PII phone masking, and JWT authentication

2. **[Business Flow & Receptionist Guide](file:///d:/Pravin/Projects/siddhi-patient-doctor-assistant/BUSINESS_FLOW.md)**
   - Empathic, professional AI Medical Receptionist persona
   - Strict 5-step conversational booking flow:
     1. Greeting & Patient Full Name
     2. 10-Digit Mobile Number Validation
     3. Fetch & Present 3 to 5 clear numbered consultation slots
     4. Save booking to DB & queue 1-hour automated reminder
     5. Final details confirmation (Doctor, Date, Time, Address, 1-hr reminder note)
   - Strict Medical Safety Guardrails & Emergency Protocol (112 / 108 / 911 deflection)
   - Out-of-scope redirection & clinic consultation timings/location inquiries
   - Reception staff human hand-off protocol
   - Approved Meta WhatsApp Template: `appointment_reminder_1hr`

3. **[Environment Variables Template](file:///d:/Pravin/Projects/siddhi-patient-doctor-assistant/.env.example)**
   - Configuration template for Meta WhatsApp, Google Gemini API, Redis, Database, and JWT.

---

## 🚀 Quick Start Guide

### 1. Prerequisites
- Python 3.11+
- Node.js 18+ and npm
- (Optional) Redis server for production session caching (falls back to resilient in-memory TTL store if offline)

---

### 2. Backend Setup & Startup

```bash
# Navigate to backend directory
cd backend

# Create virtual environment (if not already created)
python -m venv venv
.\venv\Scripts\activate   # On Windows
# source venv/bin/activate # On Linux/macOS

# Install dependencies
pip install -r requirements.txt

# Start FastAPI development server
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

- **Interactive API Documentation:** [http://localhost:8000/docs](http://localhost:8000/docs)
- **Health Check Endpoint:** [http://localhost:8000/health](http://localhost:8000/health)
- **WhatsApp Webhook:** `GET /webhook` and `POST /webhook`
- **Default Seeded Admin User:** `admin` / `admin123`

---

### 3. Frontend Setup & Startup

```bash
# Navigate to frontend directory
cd frontend

# Install dependencies
npm install

# Start Vite development server
npm run dev
```

- **Admin Portal UI:** [http://localhost:5173](http://localhost:5173)
  - **Dashboard:** Real-time clinic KPIs (Today's count, Confirmed, Cancelled, 1-Hr Reminders Queued)
  - **Appointments:** Search, filter by status/date, manual booking modal, cancel/complete actions
  - **WhatsApp Simulator:** Interactive mobile screen to test multi-turn conversations, one-click business flow scenarios, live tool execution tracker, and Redis session state inspector
  - **Doctors & Schedules:** Manage physicians, consultation hours, and morning/evening slots
  - **Patients Directory:** Patient records and WhatsApp contact information
  - **Clinic & Reminders Settings:** Clinic address, timezone, and approved WhatsApp template parameters

---

### 4. Running Automated End-to-End Tests

The test suite validates the complete end-to-end implementation against all scenarios in `BUSINESS_FLOW.md`:

```bash
$env:PYTHONPATH='backend'; .\backend\venv\Scripts\python.exe backend/tests/test_e2e_flow.py
```

Tests verified:
- [x] Webhook verification (`GET /webhook` with verify token and challenge)
- [x] Scenario A: Full 5-step conversational booking flow (Greeting -> Name -> Phone -> Available Slots -> Slot Selection -> DB confirmation)
- [x] Dynamic slot filtering (booked slots are eliminated from future recommendations)
- [x] Scenario B: Strict Medical Emergency Protocol deflection (chest pain, stroke, suicidal thoughts to 112/108)
- [x] Scenario C: Clinic location and consultation hours inquiries
- [x] Scenario D: Human staff hand-off protocol
- [x] Admin stats and database appointments API
- [x] Admin JWT authentication
