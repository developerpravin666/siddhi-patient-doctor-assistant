import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import asyncio
from sqlalchemy import text
from app.core.database import engine, AsyncSessionLocal, init_db
from app.services.database_service import db
from app.models.domain import Specialization, Clinic

async def main():
    print("1. Running init_db()...")
    await init_db()
    await db.seed_defaults_if_empty()

    print("\n2. Checking public schema tables...")
    async with engine.begin() as conn:
        res = await conn.execute(text("SELECT table_name FROM information_schema.tables WHERE table_schema='public'"))
        tables = [r[0] for r in res.fetchall()]
        print("Public tables:", tables)

    print("\n3. Testing Specialization query...")
    async with AsyncSessionLocal() as session:
        await session.execute(text("SET search_path TO public;"))
        res = await session.execute(text("SELECT count(*) FROM public.specializations"))
        print("Specializations count:", res.scalar())

    print("\n4. Checking tenant schemas...")
    async with engine.begin() as conn:
        res = await conn.execute(text("SELECT schema_name FROM information_schema.schemata WHERE schema_name LIKE 'clinic_%'"))
        schemas = [r[0] for r in res.fetchall()]
        print("Tenant schemas:", schemas)
        for s in schemas:
            r = await conn.execute(text(f"SELECT table_name FROM information_schema.tables WHERE table_schema='{s}'"))
            print(f"Tables in {s}:", [x[0] for x in r.fetchall()])

if __name__ == "__main__":
    asyncio.run(main())
