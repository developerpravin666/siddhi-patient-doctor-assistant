import os
import re
import json
from typing import List, Union, Optional
from urllib.parse import urlparse, parse_qs, urlencode, urlunparse
from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(".env", "../.env"),
        env_file_encoding="utf-8",
        extra="ignore"
    )

    ENV: str = "development"
    PORT: int = 8000
    HOST: str = "0.0.0.0"
    CORS_ORIGINS: Union[List[str], str] = [
        "http://localhost:3000",
        "http://localhost:5173",
        "http://localhost:8000",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:8000",
        "https://aquatic-americas-saskatchewan-arrested.trycloudflare.com"
    ]

    @field_validator("CORS_ORIGINS", mode="before")
    @classmethod
    def parse_cors_origins(cls, v: Union[str, List[str]]) -> List[str]:
        if isinstance(v, str):
            v = v.strip()
            if v.startswith("[") and v.endswith("]"):
                try:
                    parsed = json.loads(v)
                    if isinstance(parsed, list):
                        return [str(item).strip() for item in parsed if item]
                except Exception:
                    pass
            parts = [item.strip() for item in v.split(",") if item.strip()]
            return parts if parts else ["http://localhost:5173", "http://localhost:8000",
                                        "https://aquatic-americas-saskatchewan-arrested.trycloudflare.com"]
        return list(v)

    def get_cors_origins(self) -> List[str]:
        """
        Returns list of allowed CORS origins including standard local dev URLs.
        """
        origins = self.CORS_ORIGINS
        if isinstance(origins, str):
            origins = [origins]
        dev_defaults = [
            "http://localhost:5173",
            "http://localhost:3000",
            "http://localhost:8000",
            "http://127.0.0.1:5173",
            "http://127.0.0.1:3000",
            "http://127.0.0.1:8000"
        ]
        result = list(origins)
        for d in dev_defaults:
            if d not in result:
                result.append(d)
        return result

    # Google Gemini API
    GEMINI_API_KEY: str = Field(default="")
    GEMINI_MODEL: str = "gemini-2.5-flash"

    # Meta WhatsApp Cloud API
    WHATSAPP_PHONE_NUMBER_ID: str = ""
    WHATSAPP_BUSINESS_ACCOUNT_ID: str = ""
    WHATSAPP_ACCESS_TOKEN: str = ""
    WHATSAPP_VERIFY_TOKEN: str = "siddhi_patient_assistant_verify_token_secure_2026"
    WHATSAPP_APP_SECRET: str = ""
    WHATSAPP_API_VERSION: str = "v21.0"

    # Redis (Session Memory & Rate Limiting)
    REDIS_URL: str = "redis://localhost:6379/0"
    SESSION_EXPIRY_SECONDS: int = 1800

    # --------------------------------------------------------------------------
    # Database Configuration (PostgreSQL / SQLite)
    # --------------------------------------------------------------------------
    DATABASE_URL: str = "sqlite+aiosqlite:///./siddhi_assistant.db"

    # Discrete PostgreSQL parameters (optional, used if provided)
    POSTGRES_SERVER: Optional[str] = None
    POSTGRES_PORT: int = 5432
    POSTGRES_USER: Optional[str] = None
    POSTGRES_PASSWORD: Optional[str] = None
    POSTGRES_DB: Optional[str] = None
    POSTGRES_SSLMODE: Optional[str] = None  # require, prefer, disable

    # Production Database Pool Settings
    DB_POOL_SIZE: int = 10
    DB_MAX_OVERFLOW: int = 10
    DB_POOL_TIMEOUT: int = 30
    DB_POOL_RECYCLE: int = 1800
    DB_ECHO: bool = False

    # Scheduler & Reminders
    REMINDER_CHECK_INTERVAL_SECONDS: int = 60
    DEFAULT_CLINIC_TIMEZONE: str = "Asia/Kolkata"

    # Admin JWT Authentication
    JWT_SECRET: str = "super_secret_jwt_key_change_in_production_min_32_chars"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 1440

    # Logging Configuration
    LOG_LEVEL: str = "INFO"
    LOG_DIR: str = "logs"
    LOG_RETENTION_DAYS: int = 30

    # Clinic Default Metadata
    DEFAULT_DOCTOR_NAME: str = "Dr. Siddhi Patel"
    DEFAULT_DOCTOR_SPECIALTY: str = "General Physician"
    DEFAULT_CLINIC_NAME: str = "Dr. Siddhi Patidar's Clinic"
    DEFAULT_CLINIC_ADDRESS: str = "Suite 402, Siddhi Medical Enclave, Central Avenue"
    DEFAULT_CLINIC_PHONE: str = "+91 98765 00000"

    @field_validator("CORS_ORIGINS", mode="before")
    @classmethod
    def assemble_cors_origins(cls, v: Union[str, List[str]]) -> List[str]:
        if isinstance(v, str):
            if v.startswith("[") and v.endswith("]"):
                import json
                try:
                    return json.loads(v)
                except Exception:
                    pass
            return [i.strip() for i in v.split(",") if i.strip()]
        return v

    def get_database_url(self) -> str:
        """
        Dynamically normalizes and resolves the database connection URL.
        - Translates postgres:// and postgresql:// to postgresql+asyncpg://
        - Adapts sslmode query parameters for asyncpg compatibility
        - Combines discrete POSTGRES_* environment variables if present
        """
        # 1. Check if discrete parameters are provided
        if self.POSTGRES_SERVER and self.POSTGRES_DB:
            user = self.POSTGRES_USER or "postgres"
            password = f":{self.POSTGRES_PASSWORD}" if self.POSTGRES_PASSWORD else ""
            url = f"postgresql+asyncpg://{user}{password}@{self.POSTGRES_SERVER}:{self.POSTGRES_PORT}/{self.POSTGRES_DB}"
            if self.POSTGRES_SSLMODE:
                ssl_val = "require" if self.POSTGRES_SSLMODE in ("require", "verify-ca", "verify-full") else self.POSTGRES_SSLMODE
                url += f"?ssl={ssl_val}"
            return url

        # 2. Normalize DATABASE_URL
        raw_url = (self.DATABASE_URL or "").strip()

        # Handle postgresql:// and postgres:// -> postgresql+asyncpg://
        if raw_url.startswith("postgres://"):
            raw_url = "postgresql+asyncpg://" + raw_url[len("postgres://"):]
        elif raw_url.startswith("postgresql://"):
            raw_url = "postgresql+asyncpg://" + raw_url[len("postgresql://"):]

        # For asyncpg, replace sslmode with ssl if present in query parameters
        if "postgresql+asyncpg://" in raw_url and "sslmode=" in raw_url:
            raw_url = re.sub(r'sslmode=([a-zA-Z0-9_-]+)', r'ssl=\1', raw_url)

        return raw_url

    def get_masked_db_url(self) -> str:
        """
        Returns database connection string with password masked for safe logging.
        """
        url = self.get_database_url()
        # Mask password between ':' and '@'
        return re.sub(r':([^/@]+)@', r':******@', url)


settings = Settings()
