import sys
from pathlib import Path
backend_root = Path(__file__).resolve().parent.parent
if str(backend_root) not in sys.path:
    sys.path.insert(0, str(backend_root))

import asyncio
from sqlalchemy import text
from app.core.database import engine, Base, init_db, provision_tenant_schema
import app.models.domain  # register models


async def run_tenant_schema_test():
    print("=" * 60)
    print("TESTING POSTGRESQL SCHEMA-PER-TENANT ARCHITECTURE")
    print("=" * 60)

    # 1. Initialize database and default schema
    await init_db()
    print("✓ init_db() completed successfully")

    # 2. Provision a dedicated new schema for a second clinic tenant
    new_schema = await provision_tenant_schema("clinic_apollo")
    print(f"✓ Provisioned dedicated schema: {new_schema}")

    # 3. Check tables inside clinic_default and clinic_apollo
    async with engine.connect() as conn:
        res1 = await conn.execute(text("SELECT table_name FROM information_schema.tables WHERE table_schema = 'clinic_default' ORDER BY table_name;"))
        tables1 = [r[0] for r in res1.fetchall()]
        print("✓ Tables in clinic_default schema:", tables1)

        res2 = await conn.execute(text("SELECT table_name FROM information_schema.tables WHERE table_schema = 'clinic_apollo' ORDER BY table_name;"))
        tables2 = [r[0] for r in res2.fetchall()]
        print("✓ Tables in clinic_apollo schema:", tables2)

        res_pub = await conn.execute(text("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name;"))
        tables_pub = [r[0] for r in res_pub.fetchall()]
        print("✓ Tables in public schema:", tables_pub)

    # 4. Insert isolated record into clinic_default
    async with engine.begin() as conn:
        await conn.execute(text('SET search_path TO "clinic_default", public;'))
        await conn.execute(text("""
            INSERT INTO patients (id, tenant_id, full_name, mobile_number)
            VALUES ('p_default_1', 'tenant_default', 'Sneha (Clinic Default Patient)', '9823011111')
            ON CONFLICT (id) DO NOTHING;
        """))

    # 5. Insert isolated record into clinic_apollo
    async with engine.begin() as conn:
        await conn.execute(text('SET search_path TO "clinic_apollo", public;'))
        await conn.execute(text("""
            INSERT INTO patients (id, tenant_id, full_name, mobile_number)
            VALUES ('p_apollo_1', 'tenant_apollo', 'Rajesh (Clinic Apollo Patient)', '9823022222')
            ON CONFLICT (id) DO NOTHING;
        """))

    # 6. Verify Isolation
    async with engine.connect() as conn:
        # Check clinic_default
        await conn.execute(text('SET search_path TO "clinic_default", public;'))
        res_d = await conn.execute(text("SELECT full_name FROM patients;"))
        patients_default = [r[0] for r in res_d.fetchall()]
        print("✓ Patients queried from clinic_default schema:", patients_default)
        assert any("Sneha" in p for p in patients_default)
        assert not any("Rajesh" in p for p in patients_default), "Data leak: clinic_default saw clinic_apollo data!"

        # Check clinic_apollo
        await conn.execute(text('SET search_path TO "clinic_apollo", public;'))
        res_a = await conn.execute(text("SELECT full_name FROM patients;"))
        patients_apollo = [r[0] for r in res_a.fetchall()]
        print("✓ Patients queried from clinic_apollo schema:", patients_apollo)
        assert any("Rajesh" in p for p in patients_apollo)
        assert not any("Sneha" in p for p in patients_apollo), "Data leak: clinic_apollo saw clinic_default data!"

    print("✓ Schema isolation verified: Clinic Apollo and Clinic Default cannot see each other's patients!")

    # Clean up test schema
    async with engine.begin() as conn:
        await conn.execute(text('DROP SCHEMA IF EXISTS clinic_apollo CASCADE;'))
    print("✓ Cleaned up clinic_apollo test schema.")

    print("\n" + "=" * 60)
    print("POSTGRESQL SCHEMA-BASED MULTI-TENANCY VERIFIED!")
    print("=" * 60)


if __name__ == "__main__":
    asyncio.run(run_tenant_schema_test())
