import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import asyncio
from app.core.database import create_engine_instance
from app.core.config import settings
from sqlalchemy import text

async def find_doc():
    eng = create_engine_instance(settings.get_database_url())
    async with eng.begin() as conn:
        # Check all schemas for doctors table
        schemas_res = await conn.execute(text("""
            SELECT table_schema FROM information_schema.tables WHERE table_name = 'doctors';
        """))
        schemas = [r[0] for r in schemas_res.fetchall()]
        print("Schemas with doctors table:", schemas)
        for s in schemas:
            try:
                res = await conn.execute(text(f'SELECT id, name, clinic_id, specialty FROM "{s}".doctors WHERE id = :did'), {"did": "f8dd5f7b-ae6e-46bb-8606-0a337e5e9f0a"})
                row = res.fetchone()
                if row:
                    print(f"Found in {s}:", row)
                else:
                    # Print all doctors in this schema
                    all_docs = await conn.execute(text(f'SELECT id, name FROM "{s}".doctors LIMIT 5'))
                    print(f"Doctors in {s}:", all_docs.fetchall())
            except Exception as e:
                print(f"Error checking {s}:", e)

if __name__ == "__main__":
    asyncio.run(find_doc())
