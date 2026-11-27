import asyncio
import sys
from pathlib import Path
backend_dir = Path(__file__).resolve().parent
sys.path.insert(0, str(backend_dir))
from app.core.database import AsyncSessionLocal
from sqlalchemy import text

async def check():
    async with AsyncSessionLocal() as session:
        t_res = await session.execute(text("SELECT schema_name FROM public.tenants;"))
        for t in t_res.fetchall():
            sch = t[0]
            print(f"=== Schema: {sch} ===")
            try:
                res = await session.execute(text(f'SELECT id, patient_name, mobile_number, appointment_date, time_slot, status FROM "{sch}".appointments;'))
                rows = res.fetchall()
                print(f"Total appointments: {len(rows)}")
                for r in rows:
                    print("Row:", r)
            except Exception as e:
                print("Error:", e)

if __name__ == "__main__":
    asyncio.run(check())
