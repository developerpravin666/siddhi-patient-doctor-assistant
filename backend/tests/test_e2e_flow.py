import asyncio
import os
import sys

# Ensure backend is on PYTHONPATH
sys.path.insert(0, os.path.abspath("backend"))

from httpx import AsyncClient, ASGITransport
from app.main import app
from app.core.database import init_db
from app.services.database_service import db


async def run_tests():
    print("=" * 60)
    print("RUNNING E2E TESTS FOR SIDDHI PATIENT-DOCTOR ASSISTANT")
    print("=" * 60)

    await init_db()
    await db.seed_defaults_if_empty()

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # 1. Health check
        res = await client.get("/health")
        assert res.status_code == 200, f"Health check failed: {res.text}"
        print("✓ Health Check Passed:", res.json())

        # 2. Webhook verification GET /webhook
        verify_res = await client.get("/webhook?hub.mode=subscribe&hub.verify_token=siddhi_patient_assistant_verify_token_secure_2026&hub.challenge=test_challenge_12345")
        assert verify_res.status_code == 200
        assert verify_res.text == "test_challenge_12345"
        print("✓ Webhook Verification (GET /webhook) Passed")

        # 3. SCENARIO A: Happy Path 5-Step Booking Flow (BUSINESS_FLOW.md Section 5 Scenario A)
        test_phone = "919823012345"

        # Reset any existing session
        await client.post("/webhook/reset-session", json={"phone_number": test_phone, "message_text": ""})

        # Turn 1: Greeting
        print("\n--- Testing Turn 1: Greeting ---")
        t1 = await client.post("/webhook/simulate", json={"phone_number": test_phone, "message_text": "Hi there, I need to see Dr. Siddhi."})
        assert t1.status_code == 200
        data1 = t1.json()
        print("User: Hi there, I need to see Dr. Siddhi.")
        print("Bot:\n", data1["reply_text"])
        assert "Dr. Siddhi Patel's Clinic" in data1["reply_text"]
        assert "full name" in data1["reply_text"].lower()

        # Turn 2: Name Provided
        print("\n--- Testing Turn 2: Name Provided ---")
        t2 = await client.post("/webhook/simulate", json={"phone_number": test_phone, "message_text": "Sneha Kulkarni"})
        assert t2.status_code == 200
        data2 = t2.json()
        print("User: Sneha Kulkarni")
        print("Bot:\n", data2["reply_text"])
        assert "Sneha" in data2["reply_text"]
        assert "10-digit mobile number" in data2["reply_text"]

        # Turn 3: Phone Provided -> Trigger get_available_slots
        print("\n--- Testing Turn 3: Phone Provided ---")
        t3 = await client.post("/webhook/simulate", json={"phone_number": test_phone, "message_text": "9823012345"})
        assert t3.status_code == 200
        data3 = t3.json()
        print("User: 9823012345")
        print("Bot:\n", data3["reply_text"])
        assert "get_available_slots" in data3["tools_executed"]
        assert "available consultation slots" in data3["reply_text"].lower()

        # Turn 4: Slot Selection -> Trigger book_appointment
        print("\n--- Testing Turn 4: Slot Selection ---")
        t4 = await client.post("/webhook/simulate", json={"phone_number": test_phone, "message_text": "Option 2 please"})
        assert t4.status_code == 200
        data4 = t4.json()
        print("User: Option 2 please")
        print("Bot:\n", data4["reply_text"])
        assert "book_appointment" in data4["tools_executed"]
        assert "Appointment Confirmed" in data4["reply_text"]
        assert "Sneha Kulkarni" in data4["reply_text"]
        assert "1 hour before" in data4["reply_text"]

        # 4. SCENARIO B: Medical Emergency Protocol (BUSINESS_FLOW.md Section 4.1 & Scenario B)
        print("\n--- Testing Scenario B: Medical Emergency Protocol ---")
        emergency_phone = "919999900000"
        t_emerg = await client.post("/webhook/simulate", json={
            "phone_number": emergency_phone,
            "message_text": "My husband has severe chest pain and cannot breathe, what medicine should I give?"
        })
        assert t_emerg.status_code == 200
        data_emerg = t_emerg.json()
        print("User: My husband has severe chest pain and cannot breathe...")
        print("Bot:\n", data_emerg["reply_text"])
        assert "IMPORTANT MEDICAL NOTICE" in data_emerg["reply_text"]
        assert "cannot provide medical advice" in data_emerg["reply_text"]
        assert "112 / 911 / 108" in data_emerg["reply_text"]

        # 5. SCENARIO C: Clinic Location & Hours (BUSINESS_FLOW.md Section 4.3)
        print("\n--- Testing Scenario C: Clinic Location & Hours ---")
        t_info = await client.post("/webhook/simulate", json={
            "phone_number": "918888800000",
            "message_text": "Where is the clinic located and what are the consultation timings?"
        })
        assert t_info.status_code == 200
        data_info = t_info.json()
        print("Bot:\n", data_info["reply_text"])
        assert "Suite 402, Siddhi Medical Enclave" in data_info["reply_text"]
        assert "9:00 AM" in data_info["reply_text"] and "1:00 PM" in data_info["reply_text"]

        # 6. SCENARIO D: Human Hand-off (BUSINESS_FLOW.md Section 4.4)
        print("\n--- Testing Scenario D: Human Hand-off ---")
        t_hand = await client.post("/webhook/simulate", json={
            "phone_number": "917777700000",
            "message_text": "I need to talk to a doctor or human receptionist directly right now!"
        })
        assert t_hand.status_code == 200
        data_hand = t_hand.json()
        print("Bot:\n", data_hand["reply_text"])
        assert "flagged your request for our front-desk reception staff" in data_hand["reply_text"]
        assert "+91 98765 00000" in data_hand["reply_text"]

        # 7. Test Admin Login and authenticated API endpoints
        print("\n--- Testing Admin Stats & Appointments API ---")
        login_res = await client.post("/api/v1/auth/login", json={"username": "superadmin", "password": "superadmin123"})
        assert login_res.status_code == 200
        login_data = login_res.json()
        assert "access_token" in login_data
        admin_headers = {"Authorization": f"Bearer {login_data['access_token']}"}
        print("✓ Admin Login authentication passed!")

        stats_res = await client.get("/api/v1/admin/stats", headers=admin_headers)
        assert stats_res.status_code == 200
        stats = stats_res.json()
        print("Admin Stats:", stats)
        assert stats["total_appointments"] >= 1
        assert stats["confirmed_appointments"] >= 1

        appts_res = await client.get("/api/v1/appointments", headers=admin_headers)
        assert appts_res.status_code == 200
        appts = appts_res.json()
        print(f"Retrieved {len(appts)} appointments from database.")
        sneha_appt = next((a for a in appts if "Sneha" in a["patient_name"]), None)
        assert sneha_appt is not None
        print(f"✓ Sneha's appointment verified in database with ID: {sneha_appt['id']}")

    print("\n" + "=" * 60)
    print("ALL BACKEND E2E TESTS PASSED PERFECTLY!")
    print("=" * 60)


if __name__ == "__main__":
    asyncio.run(run_tests())
