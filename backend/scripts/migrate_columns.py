import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import asyncio
from app.core.database import create_engine_instance
from app.core.config import settings
from sqlalchemy import text

async def migrate_all():
    eng = create_engine_instance(settings.get_database_url())
    async with eng.begin() as conn:
        res = await conn.execute(text("SELECT schema_name FROM public.tenants;"))
        schemas = [r[0] for r in res.fetchall()]
        print("Migrating tenant schemas:", schemas)
        for s in schemas:
            stmts = [
                f'ALTER TABLE "{s}".doctors ALTER COLUMN specialty TYPE TEXT;',
                f'ALTER TABLE "{s}".doctors ALTER COLUMN morning_slots TYPE TEXT;',
                f'ALTER TABLE "{s}".doctors ALTER COLUMN evening_slots TYPE TEXT;',
                f'ALTER TABLE "{s}".clinics ALTER COLUMN consultation_hours TYPE TEXT;'
            ]
            for st in stmts:
                try:
                    await conn.execute(text(st))
                    print(f"  ✓ [{s}] {st}")
                except Exception as e:
                    print(f"  ✗ [{s}] {st} -> {e}")

if __name__ == "__main__":
    asyncio.run(migrate_all())
