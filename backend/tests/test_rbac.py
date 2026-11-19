import asyncio
import os
import sys

# Ensure backend is on PYTHONPATH
sys.path.insert(0, os.path.abspath("backend"))

from httpx import AsyncClient, ASGITransport
from app.main import app
from app.core.database import init_db
from app.services.database_service import db


async def run_rbac_tests():
    print("=" * 60)
    print("RUNNING RBAC & END-TO-END ROLE TESTS")
    print("=" * 60)

    await init_db()
    await db.seed_defaults_if_empty()

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # 1. Test Logins for all 3 roles
        print("\n1. Testing Login for all 3 roles...")
        
        # 1.1 Super Admin (Product Owner)
        sa_res = await client.post("/api/v1/auth/login", json={"username": "superadmin", "password": "superadmin123"})
        assert sa_res.status_code == 200, f"Superadmin login failed: {sa_res.text}"
        sa_data = sa_res.json()
        sa_token = sa_data["access_token"]
        sa_headers = {"Authorization": f"Bearer {sa_token}"}
        assert sa_data["user"]["role"] == "SUPER_ADMIN"
        print("✓ Super Admin (Product Owner) login successful: role = SUPER_ADMIN")

        # 1.2 Doctor (Clinic Admin)
        doc_res = await client.post("/api/v1/auth/login", json={"username": "doctor", "password": "doctor123"})
        assert doc_res.status_code == 200, f"Doctor login failed: {doc_res.text}"
        doc_data = doc_res.json()
        doc_token = doc_data["access_token"]
        doc_headers = {"Authorization": f"Bearer {doc_token}"}
        assert doc_data["user"]["role"] == "CLINIC_ADMIN"
        print("✓ Doctor (Clinic Admin) login successful: role = CLINIC_ADMIN")

        # 1.3 Front Desk (Receptionist)
        fd_res = await client.post("/api/v1/auth/login", json={"username": "frontdesk", "password": "frontdesk123"})
        assert fd_res.status_code == 200, f"Frontdesk login failed: {fd_res.text}"
        fd_data = fd_res.json()
        fd_token = fd_data["access_token"]
        fd_headers = {"Authorization": f"Bearer {fd_token}"}
        assert fd_data["user"]["role"] == "RECEPTIONIST"
        print("✓ Front Desk (Receptionist) login successful: role = RECEPTIONIST")

        # 2. Test Tenant Management (SUPER_ADMIN only)
        print("\n2. Testing Tenant Management RBAC...")
        # Super Admin should succeed
        sa_tenants = await client.get("/api/v1/admin/tenants", headers=sa_headers)
        assert sa_tenants.status_code == 200
        print(f"✓ Super Admin retrieved {len(sa_tenants.json())} tenants successfully.")

        # Doctor should be 403 Forbidden
        doc_tenants = await client.get("/api/v1/admin/tenants", headers=doc_headers)
        assert doc_tenants.status_code == 403, f"Expected 403, got {doc_tenants.status_code}"
        print("✓ Doctor correctly blocked with 403 Forbidden on Tenant Management.")

        # Front Desk should be 403 Forbidden
        fd_tenants = await client.get("/api/v1/admin/tenants", headers=fd_headers)
        assert fd_tenants.status_code == 403, f"Expected 403, got {fd_tenants.status_code}"
        print("✓ Front Desk correctly blocked with 403 Forbidden on Tenant Management.")

        # 3. Test User Management RBAC
        print("\n3. Testing User Management RBAC...")
        # Super Admin lists users
        sa_users = await client.get("/api/v1/admin/users", headers=sa_headers)
        assert sa_users.status_code == 200
        print(f"✓ Super Admin retrieved {len(sa_users.json())} users.")

        # Front Desk should be 403 Forbidden on Users
        fd_users = await client.get("/api/v1/admin/users", headers=fd_headers)
        assert fd_users.status_code == 403
        print("✓ Front Desk correctly blocked with 403 Forbidden on User Management.")

        # 4. Test Doctor Management RBAC (Create Doctor)
        print("\n4. Testing Doctor Management RBAC...")
        # Front Desk cannot create doctors
        fd_create_doc = await client.post("/api/v1/admin/doctors", json={
            "clinic_id": "clinic_default",
            "name": "Unauthorized Doc"
        }, headers=fd_headers)
        assert fd_create_doc.status_code == 403
        print("✓ Front Desk correctly blocked with 403 Forbidden from creating doctors.")

        # Doctor (Clinic Admin) CAN create/manage doctors in clinic
        doc_create_doc = await client.post("/api/v1/admin/doctors", json={
            "clinic_id": "clinic_default",
            "name": "Dr. Rohit Deshmukh",
            "specialty": "Cardiologist",
            "available_days": "Mon,Wed,Fri"
        }, headers=doc_headers)
        assert doc_create_doc.status_code == 201
        print("✓ Doctor (Clinic Admin) successfully created doctor profile.")

        # 5. Test Appointments & Patient Access (All 3 roles have access)
        print("\n5. Testing Appointments & Patients Access across all roles...")
        for role_name, h in [("Super Admin", sa_headers), ("Doctor", doc_headers), ("Front Desk", fd_headers)]:
            appts = await client.get("/api/v1/appointments", headers=h)
            assert appts.status_code == 200
            pts = await client.get("/api/v1/admin/patients", headers=h)
            assert pts.status_code == 200
            print(f"✓ {role_name} has authorized access to live appointments and patient directory.")

        # 6. Front Desk creates an appointment
        fd_booking = await client.post("/api/v1/appointments", json={
            "patient_name": "Aakash Verma",
            "mobile_number": "9811223344",
            "appointment_date": "2026-11-20",
            "time_slot": "10:00 AM",
            "clinic_id": "clinic_default"
        }, headers=fd_headers)
        assert fd_booking.status_code == 201
        print("✓ Front Desk successfully booked an appointment directly from front desk queue.")

    print("\n" + "=" * 60)
    print("ALL RBAC AND ROLE PERMISSION TESTS PASSED PERFECTLY!")
    print("=" * 60)


if __name__ == "__main__":
    asyncio.run(run_rbac_tests())
