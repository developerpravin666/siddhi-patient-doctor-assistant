import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import asyncio
import traceback
from httpx import AsyncClient, ASGITransport
from app.main import app

async def test_put_doctor():
    transport = ASGITransport(app=app, raise_app_exceptions=True)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Login
        l = await client.post("/api/v1/auth/login", json={"username": "superadmin", "password": "superadmin123"})
        token = l.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        doc_id = "f8dd5f7b-ae6e-46bb-8606-0a337e5e9f0a"
        payload = {
            "name": "Dr. Sameer Kulkarni, MD",
            "specialties": ["Cardiologist", "Endocrinologist"],
            "specialty": "Cardiologist, Endocrinologist",
            "available_days": "Mon,Tue,Wed,Thu,Fri,Sat",
            "slot_duration_minutes": 15,
            "morning_slots": "09:00 AM, 09:30 AM, 10:00 AM",
            "evening_slots": "04:00 PM, 04:30 PM",
            "is_active": True,
            "clinic_id": "clinic_b567d13c"
        }

        print(f"Testing PUT /api/v1/admin/doctors/{doc_id}...")
        try:
            res = await client.put(f"/api/v1/admin/doctors/{doc_id}", headers=headers, json=payload)
            print("Status:", res.status_code)
            print("Text:", res.text)
        except Exception:
            traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(test_put_doctor())
