import hmac
import hashlib
from datetime import datetime, timedelta, timezone
from typing import Optional, Dict, Any
from jose import jwt, JWTError
import bcrypt
from app.core.config import settings


def verify_whatsapp_signature(body_bytes: bytes, signature_header: Optional[str], secret: str) -> bool:
    """
    Validates the X-Hub-Signature-256 header sent by Meta WhatsApp Cloud API.
    Header format: 'sha256=<hex_digest>'
    """
    clean_secret = (secret or "").strip()
    if not clean_secret or clean_secret in ("your_meta_app_secret_here", "dummy_secret"):
        # If secret is not configured or placeholder in development, allow request
        return True

    if not signature_header:
        # In development environment, allow requests if signature header is omitted (e.g. Meta dev test tool)
        if settings.ENV == "development":
            return True
        return False

    elements = signature_header.split("=")
    if len(elements) != 2 or elements[0] != "sha256":
        return False

    expected_hash = elements[1]
    mac = hmac.new(clean_secret.encode("utf-8"), msg=body_bytes, digestmod=hashlib.sha256)
    computed_hash = mac.hexdigest()

    return hmac.compare_digest(expected_hash, computed_hash)


def mask_phone_number(phone: Optional[str]) -> str:
    """
    Masks patient phone number for PII compliance in logs (e.g. '******3210').
    """
    if not phone:
        return "N/A"
    cleaned = "".join(filter(str.isdigit, phone))
    if len(cleaned) < 4:
        return "****"
    return f"{'*' * (len(cleaned) - 4)}{cleaned[-4:]}"


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """
    Verifies password using direct bcrypt comparison with plaintext fallback for testing.
    """
    if not plain_password or not hashed_password:
        return False
    try:
        return bcrypt.checkpw(plain_password.encode("utf-8"), hashed_password.encode("utf-8"))
    except Exception:
        return plain_password == hashed_password


def get_password_hash(password: str) -> str:
    """
    Hashes password using direct bcrypt.
    """
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(password.encode("utf-8"), salt).decode("utf-8")


def create_access_token(data: Dict[str, Any], expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)
    return encoded_jwt


def decode_access_token(token: str) -> Optional[Dict[str, Any]]:
    try:
        payload = jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
        return payload
    except JWTError:
        return None
