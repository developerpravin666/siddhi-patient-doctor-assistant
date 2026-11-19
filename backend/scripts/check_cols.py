import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import asyncio
from app.core.database import create_engine_instance
from app.core.config import settings
from sqlalchemy import text

async def check_cols():
    eng = create_engine_instance(settings.get_database_url())
    async with eng.begin() as conn:
        res = await conn.execute(text("""
            SELECT column_name, data_type, character_maximum_length 
            FROM information_schema.columns 
            WHERE table_schema = 'tenant_siddhi' AND table_name = 'doctors';
        """))
        print("Columns in tenant_siddhi.doctors:")
        for col, dt, length in res.fetchall():
            print(f"  {col} ({dt}, length: {length})")

if __name__ == "__main__":
    asyncio.run(check_cols())
