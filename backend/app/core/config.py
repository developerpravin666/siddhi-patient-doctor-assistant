import os
from typing import List, Union
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
    CORS_ORIGINS: Union[List[str], str] = ["http://localhost:3000", "http://localhost:5173", "http://localhost:8000"]

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

    # Database
    DATABASE_URL: str = "sqlite+aiosqlite:///./siddhi_assistant.db"

    # Scheduler & Reminders
    REMINDER_CHECK_INTERVAL_SECONDS: int = 60
    DEFAULT_CLINIC_TIMEZONE: str = "Asia/Kolkata"

    # Admin JWT Authentication
    JWT_SECRET: str = "super_secret_jwt_key_change_in_production_min_32_chars"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 1440

    # Clinic Default Metadata
    DEFAULT_DOCTOR_NAME: str = "Dr. Siddhi Patel"
    DEFAULT_DOCTOR_SPECIALTY: str = "General Physician"
    DEFAULT_CLINIC_NAME: str = "Dr. Siddhi Patel's Clinic"
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


settings = Settings()
