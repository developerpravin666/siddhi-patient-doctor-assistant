import asyncio
import httpx

BASE_URL = "http://localhost:8000"

async def run_tests():
    async with httpx.AsyncClient(base_url=BASE_URL, timeout=15.0) as client:
        print("=== 1. Testing Super Admin Login ===")
        login_res = await client.post("/api/v1/auth/login", json={
            "username": "superadmin",
            "password": "superadmin123"
        })
        assert login_res.status_code == 200, f"Login failed: {login_res.text}"
        sa_token = login_res.json()["access_token"]
        sa_headers = {"Authorization": f"Bearer {sa_token}"}
        print("✓ Super Admin login successful")

        print("\n=== 2. Testing Specializations Master Catalog ===")
        # Get specializations
        specs_res = await client.get("/api/v1/admin/specializations", headers=sa_headers)
        assert specs_res.status_code == 200, f"List specializations failed: {specs_res.text}"
        specs = specs_res.json()
        print(f"✓ Retrieved {len(specs)} specializations from master catalog")

        # Create a new specialization (unique name for idempotency)
        import time
        unique_spec_name = f"Endocrinologist_{int(time.time())}"
        new_spec_res = await client.post("/api/v1/admin/specializations", headers=sa_headers, json={
            "name": unique_spec_name,
            "description": "Hormone, diabetes, and endocrine care",
            "is_active": True
        })
        assert new_spec_res.status_code == 201, f"Create specialization failed: {new_spec_res.text}"
        spec_id = new_spec_res.json()["id"]
        print(f"✓ Created new specialization 'Endocrinologist' (ID: {spec_id})")

        # Toggle status
        toggle_res = await client.patch(f"/api/v1/admin/specializations/{spec_id}/status", headers=sa_headers, json={
            "is_active": False
        })
        assert toggle_res.status_code == 200
        assert toggle_res.json()["is_active"] is False
        print("✓ Toggled specialization status to Inactive")

        # Reactivate
        toggle_res2 = await client.patch(f"/api/v1/admin/specializations/{spec_id}/status", headers=sa_headers, json={
            "is_active": True
        })
        assert toggle_res2.status_code == 200
        assert toggle_res2.json()["is_active"] is True
        print("✓ Reactivated specialization status to Active")

        print("\n=== 3. Testing Doctor Profile with Multiple Specializations & 15-min Intervals ===")
        doc_res = await client.post("/api/v1/admin/doctors", headers=sa_headers, json={
            "name": "Dr. Sameer Kulkarni, MD",
            "specialties": ["Cardiologist", "Endocrinologist", "General Physician"],
            "available_days": "Mon,Tue,Wed,Thu,Fri",
            "slot_duration_minutes": 15,
            "morning_slots": "09:00 AM, 09:15 AM, 09:30 AM, 09:45 AM, 10:00 AM",
            "evening_slots": "04:00 PM, 04:15 PM, 04:30 PM, 04:45 PM, 05:00 PM",
            "is_active": True
        })
        assert doc_res.status_code == 201, f"Create doctor failed: {doc_res.text}"
        doc_data = doc_res.json()
        doc_id = doc_data["id"]
        assert "Cardiologist" in doc_data["specialty"]
        assert "Endocrinologist" in doc_data["specialty"]
        assert doc_data["slot_duration_minutes"] == 15
        print(f"✓ Doctor created with multiple specialties: '{doc_data['specialty']}' and {doc_data['slot_duration_minutes']} min interval (ID: {doc_id})")

        # Fetch single doctor by ID
        get_doc_res = await client.get(f"/api/v1/admin/doctors/{doc_id}", headers=sa_headers)
        assert get_doc_res.status_code == 200
        assert get_doc_res.json()["id"] == doc_id
        print("✓ GET /admin/doctors/{id} verified successfully")

        print("\n=== 4. Testing Live Available Slots Query for Doctor ===")
        slots_res = await client.get("/api/v1/appointments/slots/available", headers=sa_headers, params={
            "date": "2026-11-20",
            "doctor_id": doc_id
        })
        assert slots_res.status_code == 200, f"Query slots failed: {slots_res.text}"
        slots_data = slots_res.json()
        assert len(slots_data["available_slots"]) > 0
        target_slot = slots_data["available_slots"][0]
        print(f"✓ Available slots for doctor on {slots_data['date']}: {len(slots_data['available_slots'])} open slots (Selected: {target_slot})")

        print("\n=== 5. Testing Clinic Staff (Front Desk) Account Creation with Zod-shaped Payload ===")
        import uuid
        test_uname = f"receptionist_{uuid.uuid4().hex[:6]}"
        user_res = await client.post("/api/v1/admin/users", headers=sa_headers, json={
            "full_name": "Meera Joshi",
            "username": test_uname,
            "password": "Password123!",
            "role": "RECEPTIONIST",
            "permissions": {
                "appointments": {"view": True, "create": True, "edit": True, "delete": False},
                "patients": {"view": True, "create": True, "edit": True, "delete": False},
                "doctors": {"view": True, "create": False, "edit": False, "delete": False},
                "simulator": {"view": True, "create": True, "edit": False, "delete": False},
                "analytics": {"view": False, "create": False, "edit": False, "delete": False}
            }
        })
        assert user_res.status_code == 201, f"Create user failed: {user_res.text}"
        u_data = user_res.json()
        u_id = u_data["id"]
        print(f"✓ Created Front Desk user '{test_uname}' (ID: {u_id})")

        # GET user by ID
        get_u_res = await client.get(f"/api/v1/admin/users/{u_id}", headers=sa_headers)
        assert get_u_res.status_code == 200
        assert get_u_res.json()["username"] == test_uname
        print("✓ GET /admin/users/{id} verified successfully")

        # Front Desk login
        fd_login = await client.post("/api/v1/auth/login", json={
            "username": test_uname,
            "password": "Password123!"
        })
        assert fd_login.status_code == 200
        fd_token = fd_login.json()["access_token"]
        fd_headers = {"Authorization": f"Bearer {fd_token}"}
        print("✓ Front Desk staff authenticated successfully")

        print("\n=== 6. Testing Patient Creation & Appointment Booking ===")
        pt_res = await client.post("/api/v1/admin/patients", headers=fd_headers, json={
            "full_name": "Siddharth Deshmukh",
            "mobile_number": "9823011223",
            "email": "siddharth@example.com",
            "gender": "MALE",
            "age": 34,
            "address": "Baner, Pune, Maharashtra",
            "status": "ACTIVE"
        })
        assert pt_res.status_code == 201, f"Create patient failed: {pt_res.text}"
        pt_id = pt_res.json()["id"]
        print(f"✓ Created patient 'Siddharth Deshmukh' (ID: {pt_id})")

        # GET patient by ID
        get_pt = await client.get(f"/api/v1/admin/patients/{pt_id}", headers=fd_headers)
        assert get_pt.status_code == 200
        assert get_pt.json()["full_name"] == "Siddharth Deshmukh"
        print("✓ GET /admin/patients/{id} verified successfully")

        # Book appointment
        appt_res = await client.post("/api/v1/appointments", headers=fd_headers, json={
            "patient_name": "Siddharth Deshmukh",
            "mobile_number": "9823011223",
            "appointment_date": "2026-11-20",
            "time_slot": target_slot,
            "doctor_id": doc_id,
            "notes": "Cardiology consultation"
        })
        assert appt_res.status_code == 201, f"Book appointment failed: {appt_res.text}"
        appt_data = appt_res.json()
        appt_id = appt_data["id"]
        print(f"✓ Appointment booked for {appt_data['patient_name']} with {appt_data['doctor_name']} at {appt_data['time_slot']} (ID: {appt_id})")

        # GET appointment by ID
        get_appt = await client.get(f"/api/v1/appointments/{appt_id}", headers=fd_headers)
        assert get_appt.status_code == 200
        assert get_appt.json()["id"] == appt_id
        print("✓ GET /appointments/{id} verified successfully")

        # PUT appointment update
        update_appt = await client.put(f"/api/v1/appointments/{appt_id}", headers=fd_headers, json={
            "patient_name": "Siddharth Deshmukh (Follow-up)",
            "time_slot": target_slot,
            "status": "CONFIRMED"
        })
        assert update_appt.status_code == 200
        assert update_appt.json()["patient_name"] == "Siddharth Deshmukh (Follow-up)"
        print("✓ PUT /appointments/{id} updated appointment successfully")

        print("\n🎉 ALL COMPREHENSIVE TESTS PASSED!")

if __name__ == "__main__":
    asyncio.run(run_tests())
