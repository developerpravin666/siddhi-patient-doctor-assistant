import sys
from pathlib import Path
backend_root = Path(__file__).resolve().parent.parent
if str(backend_root) not in sys.path:
    sys.path.insert(0, str(backend_root))

import asyncio
from httpx import AsyncClient, ASGITransport
from sqlalchemy import text
from app.main import app
from app.core.database import engine, init_db
from app.services.database_service import db

async def test_complete_onboarding_lifecycle():
    print("=" * 60)
    print("TESTING PRODUCTION ONBOARDING LIFECYCLE")
    print("1. Pristine Super Admin Only")
    print("2. Super Admin onboards Clinic Tenant")
    print("3. Clinic Admin creates Doctor and Front Desk staff")
    print("4. Front Desk user logs in and accesses isolated schema")
    print("=" * 60)

    # 1. Initialize DB and Seed ONLY superadmin
    await init_db()
    await db.seed_defaults_if_empty()

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Step 1: Verify ONLY superadmin exists initially
        async with engine.connect() as conn:
            users_res = await conn.execute(text("SELECT username FROM public.admin_users;"))
            usernames = [r[0] for r in users_res.fetchall()]
            print("✓ Initial users in DB:", usernames)
            assert "superadmin" in usernames
            assert "doctor" not in usernames, "Demo doctor should NOT be seeded"
            assert "frontdesk" not in usernames, "Demo frontdesk should NOT be seeded"

        # Step 2: Super Admin logs in
        sa_login = await client.post("/api/v1/auth/login", json={
            "username": "superadmin",
            "password": "superadmin123"
        })
        assert sa_login.status_code == 200, f"Superadmin login failed: {sa_login.text}"
        sa_token = sa_login.json()["access_token"]
        sa_headers = {"Authorization": f"Bearer {sa_token}"}
        print("✓ Step 1: Super Admin logged in successfully")

        # Step 3: Super Admin onboards new Clinic Tenant
        tenant_payload = {
            "name": "Siddhi Care Clinic",
            "schema_name": "clinic_siddhi_care",
            "owner_name": "Dr. Siddhi Patel",
            "owner_phone": "+91 98230 11111",
            "owner_email": "dr.siddhi@siddhicare.com",
            "admin_username": "drsiddhi",
            "admin_password": "clinic123",
            "status": "ACTIVE"
        }
        create_res = await client.post("/api/v1/admin/tenants", json=tenant_payload, headers=sa_headers)
        assert create_res.status_code == 201, f"Tenant onboarding failed: {create_res.text}"
        tenant_data = create_res.json()
        print(f"✓ Step 2: Super Admin onboarded Clinic Tenant '{tenant_data['name']}' with schema '{tenant_data['schema_name']}'")

        # Verify isolated schema and clinic profile exist
        async with engine.connect() as conn:
            c_res = await conn.execute(text("SELECT name, phone FROM clinic_siddhi_care.clinics;"))
            clinics = c_res.fetchall()
            assert len(clinics) == 1
            print(f"✓ Verified isolated clinic in schema 'clinic_siddhi_care': {clinics[0][0]}")

        # Step 4: Clinic Admin logs in with newly created credentials
        doc_login = await client.post("/api/v1/auth/login", json={
            "username": "drsiddhi",
            "password": "clinic123"
        })
        assert doc_login.status_code == 200, f"Clinic Admin login failed: {doc_login.text}"
        doc_data = doc_login.json()
        doc_token = doc_data["access_token"]
        doc_headers = {"Authorization": f"Bearer {doc_token}"}
        assert doc_data["user"]["role"] == "CLINIC_ADMIN"
        assert doc_data["user"]["schema_name"] == "clinic_siddhi_care"
        print("✓ Step 3: Clinic Admin ('drsiddhi') logged in with schema 'clinic_siddhi_care'")

        # Step 5: Clinic Admin creates Doctor with 15-minute slot interval
        doc_create_res = await client.post("/api/v1/admin/doctors", json={
            "name": "Dr. Siddhi Patel",
            "specialty": "Cardiologist",
            "available_days": "Mon,Tue,Wed,Thu,Fri,Sat",
            "slot_duration_minutes": 15,
            "morning_slots": "09:00 AM,09:15 AM,09:30 AM,09:45 AM,10:00 AM",
            "evening_slots": "04:00 PM,04:15 PM,04:30 PM",
            "is_active": True
        }, headers=doc_headers)
        assert doc_create_res.status_code == 201, f"Doctor creation failed: {doc_create_res.text}"
        created_doc = doc_create_res.json()
        print(f"✓ Step 4: Clinic Admin created Doctor '{created_doc['name']}' (interval: {created_doc['slot_duration_minutes']}m)")

        # Step 6: Clinic Admin creates Front Desk employee
        staff_res = await client.post("/api/v1/admin/users", json={
            "username": "receptionist_sneha",
            "password": "sneha123password",
            "full_name": "Sneha Kulkarni (Front Desk)",
            "role": "RECEPTIONIST",
            "permissions": {
                "appointments": {"view": True, "create": True, "edit": True, "delete": False},
                "patients": {"view": True, "create": True, "edit": True, "delete": False},
                "doctors": {"view": True, "create": False, "edit": False, "delete": False},
                "simulator": {"view": True, "create": True, "edit": False, "delete": False},
                "analytics": {"view": False, "create": False, "edit": False, "delete": False},
                "users": {"view": False, "create": False, "edit": False, "delete": False}
            }
        }, headers=doc_headers)
        assert staff_res.status_code == 201, f"Front desk user creation failed: {staff_res.text}"
        created_staff = staff_res.json()
        print(f"✓ Step 5: Clinic Admin created Front Desk user '{created_staff['username']}' stored in tenant schema")

        # Step 7: Front Desk user logs in
        staff_login = await client.post("/api/v1/auth/login", json={
            "username": "receptionist_sneha",
            "password": "sneha123password"
        })
        assert staff_login.status_code == 200, f"Front desk login failed: {staff_login.text}"
        staff_data = staff_login.json()
        staff_token = staff_data["access_token"]
        staff_headers = {"Authorization": f"Bearer {staff_token}"}
        assert staff_data["user"]["schema_name"] == "clinic_siddhi_care"
        print("✓ Step 6: Front Desk user logged in and received isolated tenant context")

        # Step 8: Front Desk user books an appointment
        appt_res = await client.post("/api/v1/appointments", json={
            "patient_name": "Rohan Deshmukh",
            "mobile_number": "9823099999",
            "appointment_date": "2026-11-25",
            "time_slot": "09:15 AM",
            "doctor_id": created_doc["id"]
        }, headers=staff_headers)
        assert appt_res.status_code == 201, f"Appointment booking failed: {appt_res.text}"
        appt_data = appt_res.json()
        print(f"✓ Step 7: Front Desk booked appointment '{appt_data['id']}' for {appt_data['patient_name']}")

        # Verify appointment is physically stored in clinic_siddhi_care.appointments
        async with engine.connect() as conn:
            a_res = await conn.execute(text("SELECT patient_name, doctor_name, time_slot FROM clinic_siddhi_care.appointments;"))
            appts = a_res.fetchall()
            assert len(appts) == 1
            print(f"✓ Verified physical isolation: appointment for '{appts[0][0]}' is in schema 'clinic_siddhi_care'")

    print("\n" + "=" * 60)
    print("PRODUCTION MULTI-TENANT LIFECYCLE FULLY VERIFIED!")
    print("=" * 60)

if __name__ == "__main__":
    asyncio.run(test_complete_onboarding_lifecycle())
