import json
import time
import asyncio
import logging
from typing import Dict, Any, Optional
import redis.asyncio as aioredis
from app.core.config import settings

logger = logging.getLogger("session_service")


class SessionService:
    def __init__(self):
        self._redis: Optional[aioredis.Redis] = None
        self._in_memory_store: Dict[str, Dict[str, Any]] = {}
        self._processed_messages: Dict[str, float] = {}  # msg_id -> timestamp
        self._redis_available: Optional[bool] = None

    async def _get_redis(self) -> Optional[aioredis.Redis]:
        if self._redis_available is False:
            return None

        if self._redis is None:
            try:
                client = aioredis.from_url(
                    settings.REDIS_URL,
                    decode_responses=True,
                    socket_connect_timeout=0.5,
                    socket_timeout=0.5
                )
                await asyncio.wait_for(client.ping(), timeout=0.5)
                self._redis = client
                self._redis_available = True
                logger.info("Connected to Redis successfully.")
            except Exception as e:
                self._redis_available = False
                logger.info(f"Redis is offline/unavailable ({type(e).__name__}). Using in-memory session store.")
                return None
        return self._redis

    async def get_session(self, phone_number: str) -> Dict[str, Any]:
        """
        Retrieves session for user by phone number. If absent, initializes a default state.
        """
        key = f"session:{phone_number}"
        redis_client = await self._get_redis()

        if redis_client:
            try:
                raw = await redis_client.get(key)
                if raw:
                    return json.loads(raw)
            except Exception as e:
                logger.warning(f"Redis get failed: {e}. Falling back to memory.")

        # In-memory lookup
        entry = self._in_memory_store.get(key)
        if entry:
            # Check expiry
            if time.time() - entry.get("_timestamp", 0) <= settings.SESSION_EXPIRY_SECONDS:
                data = entry.get("data", {})
                return data

        # Default empty session
        return {
            "step": 1,
            "patient_name": None,
            "mobile_number": None,
            "selected_date": None,
            "selected_slot": None,
            "clinic_id": "clinic_default",
            "offered_slots": [],
            "history": [],
            "last_interaction": int(time.time())
        }

    async def save_session(self, phone_number: str, data: Dict[str, Any]):
        """
        Saves user session state with TTL.
        """
        key = f"session:{phone_number}"
        data["last_interaction"] = int(time.time())
        serialized = json.dumps(data, default=str)

        redis_client = await self._get_redis()
        if redis_client:
            try:
                await redis_client.setex(key, settings.SESSION_EXPIRY_SECONDS, serialized)
                return
            except Exception as e:
                logger.warning(f"Redis save failed: {e}. Falling back to memory.")

        # In-memory save
        self._in_memory_store[key] = {
            "data": data,
            "_timestamp": time.time()
        }

    async def reset_session(self, phone_number: str):
        """
        Clears booking session state after successful completion or restart.
        """
        key = f"session:{phone_number}"
        redis_client = await self._get_redis()
        if redis_client:
            try:
                await redis_client.delete(key)
            except Exception:
                pass
        self._in_memory_store.pop(key, None)

    async def is_message_processed(self, message_id: str) -> bool:
        """
        Prevents duplicate WhatsApp webhook processing (Idempotency).
        """
        if not message_id:
            return False

        redis_client = await self._get_redis()
        if redis_client:
            try:
                exists = await redis_client.get(f"processed_msg:{message_id}")
                return bool(exists)
            except Exception:
                pass

        now = time.time()
        # Clean old processed message IDs older than 24h
        self._processed_messages = {
            m: t for m, t in self._processed_messages.items() if now - t < 86400
        }
        return message_id in self._processed_messages

    async def mark_message_processed(self, message_id: str):
        if not message_id:
            return

        redis_client = await self._get_redis()
        if redis_client:
            try:
                await redis_client.setex(f"processed_msg:{message_id}", 86400, "1")
                return
            except Exception:
                pass

        self._processed_messages[message_id] = time.time()


session_service = SessionService()
