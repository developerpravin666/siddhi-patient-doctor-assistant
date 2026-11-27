import time
import logging
from collections import defaultdict, deque
from typing import Deque, Dict
from fastapi import Request, HTTPException, status

logger = logging.getLogger("rate_limiter")


class RateLimiter:
    """
    Lightweight sliding-window in-memory rate limiter for FastAPI endpoints.
    Respects X-Forwarded-For / CF-Connecting-IP when behind reverse proxies or Cloudflare.
    """

    def __init__(self, max_requests: int = 10, window_seconds: int = 60, name: str = "default"):
        self.max_requests = max_requests
        self.window_seconds = window_seconds
        self.name = name
        self._hits: Dict[str, Deque[float]] = defaultdict(deque)

    def _get_client_ip(self, request: Request) -> str:
        cf_ip = request.headers.get("cf-connecting-ip")
        if cf_ip:
            return cf_ip.strip()
        xff = request.headers.get("x-forwarded-for")
        if xff:
            return xff.split(",")[0].strip()
        return request.client.host if request.client else "unknown"

    async def __call__(self, request: Request) -> None:
        client_ip = self._get_client_ip(request)
        now = time.monotonic()
        cutoff = now - self.window_seconds
        bucket = self._hits[client_ip]

        while bucket and bucket[0] <= cutoff:
            bucket.popleft()

        if len(bucket) >= self.max_requests:
            retry_after = max(1, int(self.window_seconds - (now - bucket[0])))
            logger.warning(f"Rate limit exceeded [{self.name}] for IP {client_ip}")
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Too many requests. Please wait a moment and try again.",
                headers={"Retry-After": str(retry_after)},
            )

        bucket.append(now)


login_rate_limiter = RateLimiter(max_requests=10, window_seconds=60, name="auth_login")
webhook_rate_limiter = RateLimiter(max_requests=120, window_seconds=60, name="whatsapp_webhook")
