import asyncio
from sqlalchemy import text
from app.core.database import engine, init_db
from app.core.security import get_password_hash
from app.models.domain import get_default_permissions

async def clean_database():
    print("=" * 60)
    print("RESETTING DATABASE TO PRISTINE SUPER-ADMIN ONLY STATE")
    print("=" * 60)

    # 1. Initialize public tables
    await init_db()

    async with engine.begin() as conn:
        # 2. Find and drop all legacy/demo clinic schemas
        res = await conn.execute(text("SELECT schema_name FROM information_schema.schemata WHERE schema_name LIKE 'clinic_%';"))
        schemas = [r[0] for r in res.fetchall()]
        for s in schemas:
            print(f"Dropping schema '{s}'...")
            await conn.execute(text(f'DROP SCHEMA IF EXISTS "{s}" CASCADE;'))

        # 3. Clean public tables
        print("Clearing tenants table...")
        await conn.execute(text("DELETE FROM public.tenants;"))

        print("Clearing all non-superadmin users...")
        await conn.execute(text("DELETE FROM public.admin_users WHERE username != 'superadmin';"))

        # 4. Ensure superadmin exists with full permissions
        res = await conn.execute(text("SELECT id FROM public.admin_users WHERE username = 'superadmin';"))
        sa_row = res.scalar_one_or_none()
        import uuid, json
        sa_perms = json.dumps(get_default_permissions("SUPER_ADMIN"))
        sa_pwd = get_password_hash("superadmin123")

        if not sa_row:
            sa_id = str(uuid.uuid4())
            await conn.execute(text("""
                INSERT INTO public.admin_users (id, username, hashed_password, full_name, role, tenant_id, clinic_id, permissions, is_active)
                VALUES (:id, 'superadmin', :pwd, 'Super Admin (Product Owner)', 'SUPER_ADMIN', NULL, NULL, CAST(:perms AS json), TRUE);
            """), {"id": sa_id, "pwd": sa_pwd, "perms": sa_perms})
            print("✓ Inserted clean Super Admin account (username: 'superadmin')")
        else:
            await conn.execute(text("""
                UPDATE public.admin_users 
                SET hashed_password = :pwd, full_name = 'Super Admin (Product Owner)', role = 'SUPER_ADMIN', tenant_id = NULL, clinic_id = NULL, permissions = CAST(:perms AS json), is_active = TRUE
                WHERE username = 'superadmin';
            """), {"pwd": sa_pwd, "perms": sa_perms})
            print("✓ Verified and updated existing Super Admin account.")

    # Print current state
    async with engine.connect() as conn:
        res_users = await conn.execute(text("SELECT username, role, is_active FROM public.admin_users;"))
        users = res_users.fetchall()
        print("\nCurrent Users in public.admin_users:")
        for u in users:
            print(f" - Username: {u[0]} | Role: {u[1]} | Active: {u[2]}")

        res_tenants = await conn.execute(text("SELECT id, name, schema_name FROM public.tenants;"))
        tenants = res_tenants.fetchall()
        print(f"\nCurrent Tenants in public.tenants: {len(tenants)}")

        res_schemas = await conn.execute(text("SELECT schema_name FROM information_schema.schemata WHERE schema_name LIKE 'clinic_%';"))
        schemas_remaining = [r[0] for r in res_schemas.fetchall()]
        print(f"Active Clinic Schemas remaining: {schemas_remaining}")

    print("\n" + "=" * 60)
    print("DATABASE IS NOW PRISTINE (SUPER ADMIN ONLY)!")
    print("=" * 60)

if __name__ == "__main__":
    asyncio.run(clean_database())
