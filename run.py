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

import uvicorn

if __name__ == "__main__":
    print("=" * 60)
    print("Starting Siddhi Patient-Doctor Assistant API Server...")
    print("API URL:       http://localhost:8000")
    print("Docs:          http://localhost:8000/docs")
    print("CORS Allowed:  http://localhost:5173, http://127.0.0.1:5173")
    print("=" * 60)
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)
