import sys
from pathlib import Path
backend_root = Path(__file__).resolve().parent.parent
if str(backend_root) not in sys.path:
    sys.path.insert(0, str(backend_root))

import asyncio
from httpx import AsyncClient, ASGITransport
from app.main import app
from app.core.database import init_db
from app.services.database_service import db


async def test_doctor_configures_frontdesk_permissions():
    print("=" * 60)
    print("TESTING DYNAMIC SCREEN & ACTION PERMISSIONS CONFIGURED BY DOCTOR")
    print("=" * 60)

    await init_db()
    await db.seed_defaults_if_empty()

    import uuid
    rand_suffix = uuid.uuid4().hex[:6]
    test_username = f"frontdesk_{rand_suffix}"

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # 1. Doctor logs in
        doc_login = await client.post("/api/v1/auth/login", json={"username": "doctor", "password": "doctor123"})
        doc_token = doc_login.json()["access_token"]
        doc_headers = {"Authorization": f"Bearer {doc_token}"}
        print("✓ Doctor logged in successfully")

        # 2. Doctor creates a new Front Desk user with customized permissions
        # Custom: Can view & book appointments, but CANNOT cancel appointments, and view-only for patients
        custom_perms = {
            "appointments": {"view": True, "create": True, "edit": True, "delete": False},
            "patients": {"view": True, "create": False, "edit": False, "delete": False},
            "doctors": {"view": True, "create": False, "edit": False, "delete": False},
            "simulator": {"view": True, "create": True, "edit": False, "delete": False},
            "analytics": {"view": False, "create": False, "edit": False, "delete": False},
            "users": {"view": False, "create": False, "edit": False, "delete": False}
        }

        user_res = await client.post(
            "/api/v1/admin/users",
            json={
                "username": test_username,
                "password": "password123",
                "full_name": f"Restricted Desk {rand_suffix}",
                "role": "RECEPTIONIST",
                "permissions": custom_perms
            },
            headers=doc_headers
        )
        assert user_res.status_code == 201
        user_id = user_res.json()["id"]
        print(f"✓ Doctor created Front Desk user '{test_username}' with customized permissions")

        # 3. Restricted Front Desk logs in
        fd_login = await client.post(
            "/api/v1/auth/login",
            json={"username": test_username, "password": "password123"}
        )
        assert fd_login.status_code == 200
        fd_token = fd_login.json()["access_token"]
        fd_user = fd_login.json()["user"]
        fd_headers = {"Authorization": f"Bearer {fd_token}"}
        assert fd_user["permissions"]["appointments"]["delete"] is False
        assert fd_user["permissions"]["patients"]["create"] is False
        print("✓ Restricted Front Desk logged in and verified permissions in token payload")

        # 4. Front Desk books an appointment (permitted: create=True)
        book_res = await client.post(
            "/api/v1/appointments",
            json={
                "patient_name": "Test Restricted Booking",
                "mobile_number": "9988776655",
                "appointment_date": "2026-11-25",
                "time_slot": "10:00 AM",
            },
            headers=fd_headers
        )
        assert book_res.status_code == 201
        appt_id = book_res.json()["id"]
        print("✓ Front Desk successfully booked appointment (create=True)")

        # 5. Front Desk attempts to cancel the appointment (forbidden: delete=False)
        cancel_res = await client.patch(
            f"/api/v1/appointments/{appt_id}/status",
            json={"status": "CANCELLED"},
            headers=fd_headers
        )
        assert cancel_res.status_code == 403
        print("✓ Front Desk was correctly BLOCKED (403) from cancelling appointment because delete=False!")

        # 6. Doctor updates Front Desk permissions to ALLOW delete
        updated_perms = dict(custom_perms)
        updated_perms["appointments"]["delete"] = True
        user_id = user_res.json().get("id") if user_res.status_code == 201 else None

        if not user_id:
            users_list = await client.get("/api/v1/admin/users", headers=doc_headers)
            for u in users_list.json():
                if u["username"] == "frontdesk_restricted":
                    user_id = u["id"]
                    break

        perm_update_res = await client.put(
            f"/api/v1/admin/users/{user_id}",
            json={"permissions": updated_perms},
            headers=doc_headers
        )
        assert perm_update_res.status_code == 200
        print("✓ Doctor successfully updated Front Desk user to grant delete=True!")

        # 7. Front Desk logs in again to refresh token and attempts cancel
        fd_login_new = await client.post(
            "/api/v1/auth/login",
            json={"username": test_username, "password": "password123"}
        )
        fd_token_new = fd_login_new.json()["access_token"]
        cancel_success = await client.patch(
            f"/api/v1/appointments/{appt_id}/status",
            json={"status": "CANCELLED"},
            headers={"Authorization": f"Bearer {fd_token_new}"}
        )
        assert cancel_success.status_code == 200
        assert cancel_success.json()["status"] == "CANCELLED"
        print("✓ Front Desk successfully cancelled appointment after Doctor granted permission!")

    print("\n" + "=" * 60)
    print("ALL DYNAMIC PERMISSION & ACTION MATRIX TESTS PASSED PERFECTLY!")
    print("=" * 60)


if __name__ == "__main__":
    asyncio.run(test_doctor_configures_frontdesk_permissions())
