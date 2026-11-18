# Siddhi Patient-Doctor Assistant

An automated, multi-tenant AI Medical Receptionist integrating **Meta WhatsApp Cloud API**, **Google Gemini API (Function Calling)**, and a **React Admin Dashboard** to streamline doctor appointment booking.

## 📚 Project Reference Guides

1. **[Coding Standards & Architecture Guide](file:///d:/Pravin/Projects/siddhi-patient-doctor-assistant/CODING_STANDARDS.md)**
   - Backend recommendation (FastAPI vs .NET 8)
   - WhatsApp Cloud API Webhook verification (`GET`) and event handling (`POST`)
   - Temporary session memory in Redis
   - Gemini Function Calling tools (`get_available_slots`, `book_appointment`)
   - 1-hour automated reminder background scheduler
   - Multi-tenant React Admin Portal architecture

2. **[Business Flow & Receptionist Guide](file:///d:/Pravin/Projects/siddhi-patient-doctor-assistant/BUSINESS_FLOW.md)**
   - Persona & tone of voice
   - Strict 5-step conversational booking flow
   - Medical emergency protocol & safety guardrails
   - WhatsApp Cloud API 1-hour reminder template specification
   - Turn-by-turn conversation scripts

3. **[Environment Variables Template](file:///d:/Pravin/Projects/siddhi-patient-doctor-assistant/.env.example)**
   - Meta WhatsApp, Google Gemini, Redis, Database, and JWT configuration keys.
