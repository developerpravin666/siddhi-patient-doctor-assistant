"""
Root launcher for Siddhi Patient-Doctor Assistant Backend.
Allows running the server with:
    python run.py
from the project root directory.
"""
import sys
from pathlib import Path

backend_dir = Path(__file__).resolve().parent / "backend"
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

import os
import uvicorn
from app.core.logging_config import setup_logging

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8000))
    active_log_file = setup_logging()
    print("=" * 60)
    print(f"🚀 Starting Siddhi Patient-Doctor Assistant Backend...")
    print(f"📍 API URL:      http://localhost:{port}")
    print(f"📚 Swagger Docs: http://localhost:{port}/docs")
    print(f"📝 Daily Log:    {active_log_file}")
    print("=" * 60)
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=port,
        reload=True,
        reload_dirs=[str(backend_dir / "app")],
        reload_excludes=["*.log", "logs/*", "*/logs/*", "*.db", "*.sqlite", ".git/*"]
    )
