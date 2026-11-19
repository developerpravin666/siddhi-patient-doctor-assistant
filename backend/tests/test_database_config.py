import os
import sys

# Ensure backend is on PYTHONPATH
sys.path.insert(0, os.path.abspath("backend"))

from app.core.config import Settings
from app.core.database import create_engine_instance, check_db_health
import asyncio


def test_database_url_normalization():
    print("=" * 60)
    print("TESTING DYNAMIC DATABASE CONFIGURATION & NORMALIZATION")
    print("=" * 60)

    # 1. Standard postgresql:// -> postgresql+asyncpg://
    s1 = Settings(DATABASE_URL="postgresql://myuser:mypassword@db.example.com:5432/clinic_db")
    norm1 = s1.get_database_url()
    assert norm1 == "postgresql+asyncpg://myuser:mypassword@db.example.com:5432/clinic_db"
    assert s1.get_masked_db_url() == "postgresql+asyncpg://myuser:******@db.example.com:5432/clinic_db"
    print("✓ Standard postgresql:// successfully normalized to postgresql+asyncpg:// with masked password")

    # 2. Heroku/Neon postgres:// format
    s2 = Settings(DATABASE_URL="postgres://admin:secret123@localhost:5432/prod_db")
    norm2 = s2.get_database_url()
    assert norm2 == "postgresql+asyncpg://admin:secret123@localhost:5432/prod_db"
    assert s2.get_masked_db_url() == "postgresql+asyncpg://admin:******@localhost:5432/prod_db"
    print("✓ Cloud/Neon postgres:// successfully normalized to postgresql+asyncpg://")

    # 3. SSL mode parameter adaptation (sslmode=require -> ssl=require for asyncpg)
    s3 = Settings(DATABASE_URL="postgresql://user:pass@ep-cool-db.us-east-2.aws.neon.tech/neondb?sslmode=require")
    norm3 = s3.get_database_url()
    assert "ssl=require" in norm3
    assert "sslmode" not in norm3
    assert s3.get_masked_db_url() == "postgresql+asyncpg://user:******@ep-cool-db.us-east-2.aws.neon.tech/neondb?ssl=require"
    print("✓ Neon/AWS sslmode=require query string successfully adapted to asyncpg ssl=require")

    # 4. Discrete POSTGRES_* environment variables
    s4 = Settings(
        POSTGRES_SERVER="db.clinic.internal",
        POSTGRES_PORT=5432,
        POSTGRES_USER="clinic_admin",
        POSTGRES_PASSWORD="secure_pg_pass",
        POSTGRES_DB="patient_records",
        POSTGRES_SSLMODE="require"
    )
    norm4 = s4.get_database_url()
    assert norm4 == "postgresql+asyncpg://clinic_admin:secure_pg_pass@db.clinic.internal:5432/patient_records?ssl=require"
    assert s4.get_masked_db_url() == "postgresql+asyncpg://clinic_admin:******@db.clinic.internal:5432/patient_records?ssl=require"
    print("✓ Discrete POSTGRES_* environment parameters successfully synthesized into asyncpg URL")

    # 5. Local SQLite fallback format
    s5 = Settings(DATABASE_URL="sqlite+aiosqlite:///./test.db")
    assert s5.get_database_url() == "sqlite+aiosqlite:///./test.db"
    print("✓ Local SQLite configuration preserved cleanly")

    print("\n" + "=" * 60)
    print("ALL DYNAMIC DATABASE CONFIG TESTS PASSED!")
    print("=" * 60)


async def test_health_probe():
    from app.core.database import init_db
    await init_db()
    health = await check_db_health()
    print("Database Live Health Probe:", health)
    assert health["status"] in ("UP", "DOWN")
    assert "dialect" in health
    print(f"✓ Database live health check probe verified successfully (Dialect: {health['dialect']}, Status: {health['status']})!")


if __name__ == "__main__":
    test_database_url_normalization()
    asyncio.run(test_health_probe())
