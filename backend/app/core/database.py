import logging
import re
from typing import AsyncGenerator, Dict, Any, Optional
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.orm import DeclarativeBase
from app.core.config import settings

logger = logging.getLogger("database")


def create_engine_instance(db_url: str):
    """
    Creates an async SQLAlchemy engine configured with production pool settings.
    """
    is_pg = "postgresql" in db_url
    engine_kwargs: Dict[str, Any] = {
        "echo": settings.DB_ECHO,
        "future": True,
    }

    if is_pg:
        engine_kwargs.update({
            "pool_size": settings.DB_POOL_SIZE,
            "max_overflow": settings.DB_MAX_OVERFLOW,
            "pool_timeout": settings.DB_POOL_TIMEOUT,
            "pool_recycle": settings.DB_POOL_RECYCLE,
            "pool_pre_ping": True,  # Auto-reconnect broken/stale connections
        })

    return create_async_engine(db_url, **engine_kwargs)


def is_postgres() -> bool:
    """
    Returns True if the active database dialect is PostgreSQL.
    """
    if engine is not None and getattr(engine, "dialect", None) is not None:
        return engine.dialect.name == "postgresql"
    return "postgresql" in settings.get_database_url().lower()


# Initialize primary engine using resolved dynamic connection URL
resolved_url = settings.get_database_url()
engine = create_engine_instance(resolved_url)

AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False
)


class Base(DeclarativeBase):
    pass


def sanitize_schema_name(name: str) -> str:
    """
    Sanitizes schema name to a safe PostgreSQL identifier (lowercase, alphanumeric + underscore).
    """
    cleaned = re.sub(r'[^a-zA-Z0-9_]', '_', name.strip().lower())
    if not (cleaned.startswith("clinic_") or cleaned.startswith("tenant_")):
        cleaned = f"clinic_{cleaned}"
    # PostgreSQL schema identifier limit is 63 characters
    return cleaned[:63]


async def provision_tenant_schema(schema_name: str, eng=None) -> str:
    """
    Provisions an isolated PostgreSQL schema for a Clinic Tenant with all required clinical tables:
    - clinics (clinic profile)
    - doctors
    - patients
    - appointments
    """
    target_engine = eng or engine
    safe_schema = sanitize_schema_name(schema_name)
    is_postgres = "postgresql" in str(target_engine.url)

    if not is_postgres:
        # SQLite fallback: single database table space
        async with target_engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        return safe_schema

    async with target_engine.begin() as conn:
        logger.info(f"Provisioning dedicated PostgreSQL schema: '{safe_schema}'...")
        await conn.execute(text(f'CREATE SCHEMA IF NOT EXISTS "{safe_schema}";'))

        # DDL for isolated tenant tables within safe_schema
        ddl = f"""
        CREATE TABLE IF NOT EXISTS "{safe_schema}".admin_users (
            id VARCHAR(36) PRIMARY KEY,
            username VARCHAR(50) UNIQUE NOT NULL,
            hashed_password VARCHAR(255) NOT NULL,
            full_name VARCHAR(100) NOT NULL,
            role VARCHAR(30) NOT NULL,
            tenant_id VARCHAR(36),
            clinic_id VARCHAR(36),
            permissions JSON,
            is_active BOOLEAN DEFAULT TRUE,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS "{safe_schema}".clinics (
            id VARCHAR(36) PRIMARY KEY,
            tenant_id VARCHAR(36),
            name VARCHAR(150) NOT NULL,
            address VARCHAR(255) NOT NULL,
            phone VARCHAR(30),
            timezone VARCHAR(50) DEFAULT 'Asia/Kolkata',
            consultation_hours VARCHAR(255),
            whatsapp_phone_number_id VARCHAR(50),
            whatsapp_business_account_id VARCHAR(50),
            whatsapp_access_token TEXT,
            whatsapp_verify_token VARCHAR(100),
            bot_config JSON,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS "{safe_schema}".doctors (
            id VARCHAR(36) PRIMARY KEY,
            clinic_id VARCHAR(36) NOT NULL REFERENCES "{safe_schema}".clinics(id) ON DELETE CASCADE,
            name VARCHAR(100) NOT NULL,
            specialty TEXT NOT NULL,
            available_days VARCHAR(100) NOT NULL,
            morning_slots TEXT,
            evening_slots TEXT,
            slot_duration_minutes INTEGER DEFAULT 30,
            is_active BOOLEAN DEFAULT TRUE,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS "{safe_schema}".patients (
            id VARCHAR(36) PRIMARY KEY,
            tenant_id VARCHAR(36),
            full_name VARCHAR(120) NOT NULL,
            mobile_number VARCHAR(20) NOT NULL,
            email VARCHAR(100),
            gender VARCHAR(20),
            age INTEGER,
            address VARCHAR(255),
            status VARCHAR(20) DEFAULT 'ACTIVE',
            is_active BOOLEAN DEFAULT TRUE,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS "{safe_schema}".appointments (
            id VARCHAR(36) PRIMARY KEY,
            tenant_id VARCHAR(36),
            clinic_id VARCHAR(36) NOT NULL REFERENCES "{safe_schema}".clinics(id) ON DELETE CASCADE,
            doctor_id VARCHAR(36) REFERENCES "{safe_schema}".doctors(id) ON DELETE SET NULL,
            patient_id VARCHAR(36),
            patient_name VARCHAR(120) NOT NULL,
            mobile_number VARCHAR(20) NOT NULL,
            doctor_name VARCHAR(100) NOT NULL,
            clinic_name VARCHAR(150) NOT NULL,
            clinic_address VARCHAR(255),
            appointment_date VARCHAR(15) NOT NULL,
            time_slot VARCHAR(20) NOT NULL,
            appointment_datetime TIMESTAMP WITH TIME ZONE NOT NULL,
            status VARCHAR(25) DEFAULT 'CONFIRMED',
            reminder_sent BOOLEAN DEFAULT FALSE,
            reminder_sent_at TIMESTAMP WITH TIME ZONE,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS "idx_{safe_schema}_appt_date" ON "{safe_schema}".appointments (appointment_date);
        CREATE INDEX IF NOT EXISTS "idx_{safe_schema}_appt_mobile" ON "{safe_schema}".appointments (mobile_number);
        CREATE INDEX IF NOT EXISTS "idx_{safe_schema}_patient_mobile" ON "{safe_schema}".patients (mobile_number);
        """
        for stmt in ddl.split(";"):
            cleaned_stmt = stmt.strip()
            if cleaned_stmt:
                await conn.execute(text(cleaned_stmt))

        # Migrations & column drops for existing schemas
        schema_migrations = [
            f'CREATE TABLE IF NOT EXISTS "{safe_schema}".admin_users (id VARCHAR(36) PRIMARY KEY, username VARCHAR(50) UNIQUE NOT NULL, hashed_password VARCHAR(255) NOT NULL, full_name VARCHAR(100) NOT NULL, role VARCHAR(30) NOT NULL, tenant_id VARCHAR(36), clinic_id VARCHAR(36), permissions JSON, is_active BOOLEAN DEFAULT TRUE, created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP);',
            f'ALTER TABLE "{safe_schema}".clinics ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(36);',
            f'ALTER TABLE "{safe_schema}".clinics ADD COLUMN IF NOT EXISTS whatsapp_business_account_id VARCHAR(50);',
            f'ALTER TABLE "{safe_schema}".clinics ADD COLUMN IF NOT EXISTS whatsapp_access_token TEXT;',
            f'ALTER TABLE "{safe_schema}".clinics ADD COLUMN IF NOT EXISTS whatsapp_verify_token VARCHAR(100);',
            f'ALTER TABLE "{safe_schema}".clinics ADD COLUMN IF NOT EXISTS bot_config JSON;',
            f'ALTER TABLE "{safe_schema}".doctors ALTER COLUMN specialty TYPE TEXT;',
            f'ALTER TABLE "{safe_schema}".doctors ALTER COLUMN morning_slots TYPE TEXT;',
            f'ALTER TABLE "{safe_schema}".doctors ALTER COLUMN evening_slots TYPE TEXT;',
            f'ALTER TABLE "{safe_schema}".patients ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(36);',
            f'ALTER TABLE "{safe_schema}".patients ADD COLUMN IF NOT EXISTS email VARCHAR(100);',
            f'ALTER TABLE "{safe_schema}".patients ADD COLUMN IF NOT EXISTS gender VARCHAR(20);',
            f'ALTER TABLE "{safe_schema}".patients ADD COLUMN IF NOT EXISTS age INTEGER;',
            f'ALTER TABLE "{safe_schema}".patients ADD COLUMN IF NOT EXISTS address VARCHAR(255);',
            f'ALTER TABLE "{safe_schema}".patients ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT \'ACTIVE\';',
            f'ALTER TABLE "{safe_schema}".patients ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;',
            f'ALTER TABLE "{safe_schema}".appointments ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(36);',
        ]
        for m_stmt in schema_migrations:
            try:
                async with conn.begin_nested():
                    await conn.execute(text(m_stmt))
            except Exception as e:
                logger.debug(f"Optional migration skipped for {safe_schema}: {e}")

        logger.info(f"Tenant schema '{safe_schema}' provisioned successfully with isolated tables.")

    return safe_schema


async def get_db_for_tenant(tenant_schema: str = "clinic_default") -> AsyncGenerator[AsyncSession, None]:
    """
    Yields an async database session configured with PostgreSQL search_path set to tenant_schema.
    """
    async with AsyncSessionLocal() as session:
        try:
            if is_postgres():
                safe_schema = sanitize_schema_name(tenant_schema)
                await session.execute(text(f'SET search_path TO "{safe_schema}", public;'))
            yield session
        finally:
            await session.close()


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """
    FastAPI dependency yielding an async database session per request.
    Defaults to public schema.
    """
    async with AsyncSessionLocal() as session:
        try:
            if is_postgres():
                await session.execute(text('SET search_path TO public;'))
            yield session
        finally:
            await session.close()


async def init_db():
    """
    Initializes database schema with connection ping, self-provisioning,
    public schema tables, and default clinic tenant schema.
    """
    global engine, AsyncSessionLocal
    current_url = settings.get_database_url()
    masked_url = settings.get_masked_db_url()

    logger.info(f"Connecting to database: {masked_url}...")

    try:
        # 1. Verify connection with a lightweight ping
        async with engine.begin() as conn:
            await conn.execute(text("SELECT 1"))

            if is_postgres():
                # Create public tables in public schema
                await conn.execute(text('SET search_path TO public;'))
                
                # Ensure core public tables exist
                public_ddl = """
                    CREATE TABLE IF NOT EXISTS public.tenants (
                        id VARCHAR(36) PRIMARY KEY,
                        name VARCHAR(100) NOT NULL,
                        schema_name VARCHAR(63) NOT NULL,
                        owner_name VARCHAR(100),
                        owner_phone VARCHAR(30),
                        owner_email VARCHAR(100),
                        status VARCHAR(20) DEFAULT 'ACTIVE',
                        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                    );

                    CREATE TABLE IF NOT EXISTS public.admin_users (
                        id VARCHAR(36) PRIMARY KEY,
                        username VARCHAR(50) UNIQUE NOT NULL,
                        hashed_password VARCHAR(255) NOT NULL,
                        full_name VARCHAR(100) NOT NULL,
                        role VARCHAR(30) NOT NULL,
                        tenant_id VARCHAR(36),
                        clinic_id VARCHAR(36),
                        permissions JSON,
                        is_active BOOLEAN DEFAULT TRUE,
                        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                    );

                    CREATE TABLE IF NOT EXISTS public.specializations (
                        id VARCHAR(36) PRIMARY KEY,
                        name VARCHAR(100) UNIQUE NOT NULL,
                        description VARCHAR(255),
                        is_active BOOLEAN DEFAULT TRUE,
                        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                    );

                    CREATE TABLE IF NOT EXISTS public.clinics (
                        id VARCHAR(36) PRIMARY KEY,
                        tenant_id VARCHAR(36) REFERENCES public.tenants(id) ON DELETE CASCADE,
                        name VARCHAR(150) NOT NULL,
                        address VARCHAR(255) NOT NULL,
                        phone VARCHAR(30),
                        timezone VARCHAR(50) DEFAULT 'Asia/Kolkata',
                        consultation_hours VARCHAR(255),
                        whatsapp_phone_number_id VARCHAR(50),
                        whatsapp_business_account_id VARCHAR(50),
                        whatsapp_access_token TEXT,
                        whatsapp_verify_token VARCHAR(100),
                        bot_config JSON,
                        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                    );

                    CREATE TABLE IF NOT EXISTS public.doctors (
                        id VARCHAR(36) PRIMARY KEY,
                        clinic_id VARCHAR(36) NOT NULL,
                        name VARCHAR(100) NOT NULL,
                        specialty TEXT NOT NULL,
                        available_days VARCHAR(100) NOT NULL,
                        morning_slots TEXT,
                        evening_slots TEXT,
                        slot_duration_minutes INTEGER DEFAULT 30,
                        is_active BOOLEAN DEFAULT TRUE,
                        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                    );

                    CREATE TABLE IF NOT EXISTS public.patients (
                        id VARCHAR(36) PRIMARY KEY,
                        tenant_id VARCHAR(36),
                        full_name VARCHAR(120) NOT NULL,
                        mobile_number VARCHAR(20) NOT NULL,
                        email VARCHAR(100),
                        gender VARCHAR(20),
                        age INTEGER,
                        address VARCHAR(255),
                        status VARCHAR(20) DEFAULT 'ACTIVE',
                        is_active BOOLEAN DEFAULT TRUE,
                        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                    );

                    CREATE TABLE IF NOT EXISTS public.appointments (
                        id VARCHAR(36) PRIMARY KEY,
                        tenant_id VARCHAR(36),
                        clinic_id VARCHAR(36) NOT NULL,
                        doctor_id VARCHAR(36),
                        patient_id VARCHAR(36),
                        patient_name VARCHAR(120) NOT NULL,
                        mobile_number VARCHAR(20) NOT NULL,
                        doctor_name VARCHAR(100) NOT NULL,
                        clinic_name VARCHAR(150) NOT NULL,
                        clinic_address VARCHAR(255),
                        appointment_date VARCHAR(15) NOT NULL,
                        time_slot VARCHAR(20) NOT NULL,
                        appointment_datetime TIMESTAMP WITH TIME ZONE NOT NULL,
                        status VARCHAR(25) DEFAULT 'CONFIRMED',
                        reminder_sent BOOLEAN DEFAULT FALSE,
                        reminder_sent_at TIMESTAMP WITH TIME ZONE,
                        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                    );

                    CREATE TABLE IF NOT EXISTS public.webhook_events (
                        id VARCHAR(36) PRIMARY KEY,
                        event_type VARCHAR(50) DEFAULT 'message',
                        sender_phone VARCHAR(30),
                        recipient_phone_id VARCHAR(50),
                        message_id VARCHAR(100),
                        message_body TEXT,
                        status VARCHAR(30) DEFAULT 'PROCESSED',
                        error_message TEXT,
                        raw_payload JSON,
                        headers JSON,
                        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                    );
                    CREATE INDEX IF NOT EXISTS idx_webhook_events_created_at ON public.webhook_events (created_at DESC);
                    CREATE INDEX IF NOT EXISTS idx_webhook_events_sender_phone ON public.webhook_events (sender_phone);
                """
                for p_stmt in public_ddl.split(";"):
                    p_cleaned = p_stmt.strip()
                    if p_cleaned:
                        await conn.execute(text(p_cleaned))

                # Auto-migrate any missing columns on public tables safely using savepoints
                public_migrations = [
                    "ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS schema_name VARCHAR(63);",
                    "ALTER TABLE public.tenants ALTER COLUMN schema_name DROP DEFAULT;",
                    "ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS owner_name VARCHAR(100);",
                    "ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS owner_phone VARCHAR(30);",
                    "ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS owner_email VARCHAR(100);",
                    "ALTER TABLE public.admin_users ADD COLUMN IF NOT EXISTS permissions JSON;",
                    "ALTER TABLE public.admin_users ALTER COLUMN role DROP DEFAULT;",
                    "ALTER TABLE public.clinics ADD COLUMN IF NOT EXISTS whatsapp_business_account_id VARCHAR(50);",
                    "ALTER TABLE public.clinics ADD COLUMN IF NOT EXISTS whatsapp_access_token TEXT;",
                    "ALTER TABLE public.clinics ADD COLUMN IF NOT EXISTS whatsapp_verify_token VARCHAR(100);",
                    "ALTER TABLE public.clinics ADD COLUMN IF NOT EXISTS bot_config JSON;",
                ]
                for p_mig in public_migrations:
                    try:
                        async with conn.begin_nested():
                            await conn.execute(text(p_mig))
                    except Exception:
                        pass

                # Auto-migrate all active tenant schemas to ensure TEXT slots and specializations
                try:
                    t_res = await conn.execute(text("SELECT schema_name FROM public.tenants;"))
                    for row in t_res.fetchall():
                        s_name = sanitize_schema_name(row[0])
                        for t_sql in [
                            f'ALTER TABLE "{s_name}".doctors ALTER COLUMN specialty TYPE TEXT;',
                            f'ALTER TABLE "{s_name}".doctors ALTER COLUMN morning_slots TYPE TEXT;',
                            f'ALTER TABLE "{s_name}".doctors ALTER COLUMN evening_slots TYPE TEXT;',
                            f'ALTER TABLE "{s_name}".clinics ALTER COLUMN consultation_hours TYPE TEXT;',
                        ]:
                            try:
                                async with conn.begin_nested():
                                    await conn.execute(text(t_sql))
                            except Exception:
                                pass
                except Exception:
                    pass
            else:
                await conn.run_sync(Base.metadata.create_all)

        dialect_name = engine.dialect.name
        logger.info(f"Database ({dialect_name}) public tables initialized successfully.")

    except Exception as e:
        logger.warning(f"Could not connect to primary database at {masked_url}: {e}")

        # If PostgreSQL target database does not exist, auto-create it
        if "postgresql" in current_url and ("does not exist" in str(e).lower() or "invalidcatalognameerror" in str(e).lower()):
            try:
                from urllib.parse import urlparse
                parsed = urlparse(current_url)
                target_db = parsed.path.lstrip("/").split("?")[0]
                if target_db:
                    logger.info(f"Target database '{target_db}' does not exist. Auto-provisioning on PostgreSQL server...")
                    import asyncpg
                    maint_conn = await asyncpg.connect(
                        user=parsed.username or "postgres",
                        password=parsed.password or "",
                        host=parsed.hostname or "localhost",
                        port=parsed.port or 5432,
                        database="postgres"
                    )
                    await maint_conn.execute(f'CREATE DATABASE "{target_db}";')
                    await maint_conn.close()
                    logger.info(f"Database '{target_db}' auto-created successfully. Reconnecting...")
                    async with engine.begin() as conn:
                        await conn.execute(text("SELECT 1"))
                        await conn.execute(text('SET search_path TO public;'))
                        public_tables = [
                            Base.metadata.tables[t]
                            for t in ["tenants", "admin_users", "specializations", "clinics", "doctors", "patients", "appointments"]
                            if t in Base.metadata.tables
                        ]
                        if public_tables:
                            await conn.run_sync(lambda sync_conn: Base.metadata.create_all(sync_conn, tables=public_tables))
                    logger.info("PostgreSQL database and tables initialized successfully.")
                    return
            except Exception as auto_err:
                logger.warning(f"Auto-provisioning failed: {auto_err}")

        # If PostgreSQL was configured but unavailable locally, fall back to SQLite
        if "postgresql" in current_url:
            fallback_url = "sqlite+aiosqlite:///./siddhi_assistant.db"
            logger.info(f"Falling back to resilient local database: {fallback_url}")
            engine = create_engine_instance(fallback_url)
            AsyncSessionLocal.configure(bind=engine)
            async with engine.begin() as conn:
                await conn.run_sync(Base.metadata.create_all)
            logger.info("Resilient local database schema initialized successfully.")
        else:
            raise e


async def check_db_health() -> Dict[str, Any]:
    """
    Health check probe for database connectivity.
    """
    try:
        async with engine.connect() as conn:
            result = await conn.execute(text("SELECT 1"))
            result.fetchone()
            return {
                "status": "UP",
                "dialect": engine.dialect.name,
                "driver": engine.dialect.driver,
                "pool_size": settings.DB_POOL_SIZE if "postgresql" in settings.get_database_url() else 1
            }
    except Exception as e:
        return {
            "status": "DOWN",
            "error": str(e)
        }
