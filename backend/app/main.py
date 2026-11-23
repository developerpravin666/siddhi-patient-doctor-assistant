import sys
from pathlib import Path

# Ensure backend root is on sys.path if run directly as a script
backend_root = Path(__file__).resolve().parent.parent
if str(backend_root) not in sys.path:
    sys.path.insert(0, str(backend_root))

import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from apscheduler.schedulers.asyncio import AsyncIOScheduler
import time
from app.core.config import settings
from app.core.logging_config import setup_logging
from app.core.tenant_context import set_tenant_override, reset_tenant_override
from app.core.database import init_db, check_db_health
from app.services.database_service import db
from app.services.reminder_service import check_and_send_1hr_reminders
from app.api.v1.webhook import router as webhook_router
from app.api.v1.auth import router as auth_router
from app.api.v1.appointments import router as appointments_router
from app.api.v1.admin import router as admin_router

# Initialize application-wide daily text file logging
setup_logging(log_level=settings.LOG_LEVEL, log_dir=settings.LOG_DIR, retention_days=settings.LOG_RETENTION_DAYS)
logger = logging.getLogger("main")

scheduler = AsyncIOScheduler()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # 1. Startup: Initialize Database Tables
    logger.info("Initializing database schema...")
    await init_db()

    # 2. Seed initial default Tenant, Clinic, Doctor, and Admin
    logger.info("Seeding initial database entities if not present...")
    await db.seed_defaults_if_empty()

    # 3. Start APScheduler for 1-Hour Automated WhatsApp Reminders
    logger.info(f"Starting APScheduler (interval: {settings.REMINDER_CHECK_INTERVAL_SECONDS}s)...")
    scheduler.add_job(
        check_and_send_1hr_reminders,
        "interval",
        seconds=settings.REMINDER_CHECK_INTERVAL_SECONDS,
        id="check_1hr_reminders",
        replace_existing=True
    )
    scheduler.start()

    yield

    # 4. Shutdown: Stop Scheduler
    logger.info("Shutting down APScheduler...")
    scheduler.shutdown(wait=False)


app = FastAPI(
    title="Siddhi Patient-Doctor Assistant API",
    description="Multi-tenant AI Medical Receptionist & Appointment Booking Engine",
    version="1.0.0",
    lifespan=lifespan
)

# CORS Configuration for Frontend Integration (http://localhost:5173, etc.)
origins = settings.get_cors_origins()
logger.info(f"Configuring CORS with origins: {origins}")

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1|.*\.trycloudflare\.com|.*\.ngrok-free\.app|.*\.ngrok\.io|.*\.loca\.lt)(:\d+)?$",
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"],
    allow_headers=["*"],
    expose_headers=["*", "X-Total-Count", "x-total-count"],
    max_age=86400,
)


@app.middleware("http")
async def tenant_context_middleware(request: Request, call_next):
    """
    Captures X-Tenant-ID or X-Tenant-Schema header sent by Super Admin to impersonate
    or manage specific clinic tenants. Stores context safely per async execution task.
    """
    tenant_header = request.headers.get("x-tenant-id") or request.headers.get("x-tenant-schema")
    token = set_tenant_override(tenant_header)
    try:
        response = await call_next(request)
        return response
    finally:
        reset_tenant_override(token)


from starlette.exceptions import HTTPException as StarletteHTTPException


@app.exception_handler(StarletteHTTPException)
async def custom_http_exception_handler(request: Request, exc: StarletteHTTPException):
    origin = request.headers.get("origin") or "http://localhost:5173"
    # Log 4xx warnings to file
    if exc.status_code >= 400:
        logger.warning(f"HTTP {exc.status_code} on {request.method} {request.url.path}: {exc.detail}")
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.detail},
        headers={
            "Access-Control-Allow-Origin": origin,
            "Access-Control-Allow-Credentials": "true",
            "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS, HEAD",
            "Access-Control-Allow-Headers": "*",
        }
    )


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    import traceback
    tb = traceback.format_exc()
    logger.error(
        f"GLOBAL UNHANDLED EXCEPTION on {request.method} {request.url.path}\n"
        f"Client: {request.client.host if request.client else 'unknown'}\n"
        f"Headers: {dict(request.headers)}\n"
        f"Traceback:\n{tb}"
    )
    # Flush all handlers immediately so daily text log file captures the crash
    for handler in logging.getLogger().handlers:
        try:
            handler.flush()
        except Exception:
            pass
    origin = request.headers.get("origin") or "http://localhost:5173"
    return JSONResponse(
        status_code=500,
        content={"detail": f"{type(exc).__name__}: {str(exc)}", "type": type(exc).__name__},
        headers={
            "Access-Control-Allow-Origin": origin,
            "Access-Control-Allow-Credentials": "true",
            "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS, HEAD",
            "Access-Control-Allow-Headers": "*",
        }
    )

# Include Routers
app.include_router(webhook_router)
app.include_router(webhook_router, prefix="/api/v1")
app.include_router(auth_router, prefix="/api/v1")
app.include_router(appointments_router, prefix="/api/v1")
app.include_router(admin_router, prefix="/api/v1")


@app.get("/health", tags=["Health"])
async def health_check():
    db_health = await check_db_health()
    return {
        "status": "HEALTHY" if db_health.get("status") == "UP" else "DEGRADED",
        "service": "Siddhi Patient-Doctor Assistant",
        "environment": settings.ENV,
        "gemini_model": settings.GEMINI_MODEL,
        "database": db_health
    }


# Mount Frontend Production Assets if available
import os
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

frontend_dist_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "frontend", "dist"))

if os.path.exists(frontend_dist_path):
    app.mount("/assets", StaticFiles(directory=os.path.join(frontend_dist_path, "assets")), name="assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    async def serve_frontend(full_path: str):
        # Don't intercept API or docs routes
        if full_path.startswith("api/") or full_path.startswith("webhook") or full_path.startswith("docs") or full_path.startswith("openapi.json"):
            from fastapi import HTTPException
            raise HTTPException(status_code=404, detail="Not Found")
        file_path = os.path.join(frontend_dist_path, full_path)
        if os.path.exists(file_path) and os.path.isfile(file_path):
            return FileResponse(file_path)
        return FileResponse(os.path.join(frontend_dist_path, "index.html"))
else:
    @app.get("/", tags=["Root"])
    async def root():
        return {
            "message": "Welcome to Siddhi Patient-Doctor Assistant API",
            "docs": "/docs",
            "webhook_url": "/webhook",
            "health": "/health"
        }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)

