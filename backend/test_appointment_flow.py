import os
import sys

backend_dir = os.path.dirname(os.path.abspath(__file__))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

import asyncio
from app.core.database import init_db
from app.services.database_service import db
from app.services.gemini_service import gemini_service

async def run_full_workflow():
    print("=" * 70)
    print("STARTING END-TO-END PATIENT APPOINTMENT BOOKING WORKFLOW TEST")
    print("=" * 70)

    # 1. Initialize DB and verify seed
    await init_db()
    print("[DB] Initialized and verified.")

    # Simulated WhatsApp user session with incoming sender_phone
    session = {"sender_phone": "919009368666"}
    history = []

    # -------------------------------------------------------------
    # Step 1: Trigger & Welcome
    # -------------------------------------------------------------
    print("\n--- TURN 1: Patient says 'Hi' ---")
    reply1, tools1, session = await gemini_service.run_turn("Hi", history, session)
    print("Bot Response:\n" + reply1)
    assert "Book Appointment" in reply1 or "1️⃣" in reply1, "Welcome menu must offer Book Appointment option"

    # -------------------------------------------------------------
    # Step 2: Doctor Selection
    # -------------------------------------------------------------
    print("\n--- TURN 2: Patient selects Option '1' (Book Appointment) ---")
    reply2, tools2, session = await gemini_service.run_turn("1", history, session)
    print("Bot Response:\n" + reply2)

    # If multiple doctors exist, bot asks to choose. If 1 doctor, bot auto-selected.
    if session.get("workflow_state") == "DOCTOR_SELECTION":
        print("\n--- TURN 2b: Selecting Doctor Option '1' ---")
        reply2b, tools2b, session = await gemini_service.run_turn("1", history, session)
        print("Bot Response:\n" + reply2b)

    assert session.get("workflow_state") == "COLLECT_NAME", f"Expected state COLLECT_NAME, got {session.get('workflow_state')}"

    # -------------------------------------------------------------
    # Step 3: Patient Full Name Collection
    # -------------------------------------------------------------
    print("\n--- TURN 3: Patient provides Full Name 'Rahul Sharma' ---")
    reply3, tools3, session = await gemini_service.run_turn("Rahul Sharma", history, session)
    print("Bot Response:\n" + reply3)
    assert session.get("workflow_state") == "COLLECT_PHONE", f"Expected state COLLECT_PHONE, got {session.get('workflow_state')}"
    assert session.get("patient_name") == "Rahul Sharma"

    # -------------------------------------------------------------
    # Step 4: Phone Number Collection (Confirm detected phone)
    # -------------------------------------------------------------
    print("\n--- TURN 4: Patient confirms detected phone '1' ---")
    reply4, tools4, session = await gemini_service.run_turn("1", history, session)
    print("Bot Response:\n" + reply4)
    assert session.get("workflow_state") == "COLLECT_ADDRESS", f"Expected state COLLECT_ADDRESS, got {session.get('workflow_state')}"
    assert session.get("mobile_number") in ("9009368666", "919009368666")

    # -------------------------------------------------------------
    # Step 5: Address Collection (Skip)
    # -------------------------------------------------------------
    print("\n--- TURN 5: Patient sends 'Skip' for address ---")
    reply5, tools5, session = await gemini_service.run_turn("Skip", history, session)
    print("Bot Response:\n" + reply5)
    assert session.get("workflow_state") == "SELECT_DATE", f"Expected state SELECT_DATE, got {session.get('workflow_state')}"

    # -------------------------------------------------------------
    # Step 6: Select Date Option '1' (Tomorrow)
    # -------------------------------------------------------------
    print("\n--- TURN 6: Patient selects Option '1' (Tomorrow) ---")
    reply6, tools6, session = await gemini_service.run_turn("1", history, session)
    print("Bot Response:\n" + reply6)
    assert session.get("workflow_state") == "SELECT_TIME_SLOT", f"Expected state SELECT_TIME_SLOT, got {session.get('workflow_state')}"
    assert session.get("selected_date") is not None
    assert "available consultation slots" in reply6.lower() or "slot" in reply6.lower()

    # -------------------------------------------------------------
    # Step 7: Time Slot Selection & Confirmation
    # -------------------------------------------------------------
    print("\n--- TURN 7: Patient selects Time Slot Option '1' ---")
    reply7, tools7, session = await gemini_service.run_turn("1", history, session)
    print("Bot Response:\n" + reply7)
    assert session.get("workflow_state") == "CONFIRMATION", f"Expected state CONFIRMATION, got {session.get('workflow_state')}"
    assert "Booking ID" in reply7 or "Confirmed" in reply7 or "Appointment Confirmed" in reply7
    print("\n" + "=" * 70)
    print("[SUCCESS] Entire 7-turn booking workflow validated end-to-end!")
    print("=" * 70)

if __name__ == "__main__":
    asyncio.run(run_full_workflow())
