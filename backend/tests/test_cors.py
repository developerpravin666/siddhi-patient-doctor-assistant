import sys
from pathlib import Path
backend_root = Path(__file__).resolve().parent.parent
if str(backend_root) not in sys.path:
    sys.path.insert(0, str(backend_root))

import asyncio
from httpx import AsyncClient, ASGITransport
from app.main import app


async def test_cors_preflight_and_actual_requests():
    from app.core.database import init_db
    await init_db()

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # 1. Test CORS preflight (OPTIONS) from http://localhost:5173
        preflight_res = await client.options(
            "/api/v1/auth/login",
            headers={
                "Origin": "http://localhost:5173",
                "Access-Control-Request-Method": "POST",
                "Access-Control-Request-Headers": "content-type,authorization"
            }
        )
        print("Preflight status:", preflight_res.status_code)
        print("Preflight headers:", dict(preflight_res.headers))
        assert preflight_res.status_code == 200
        assert preflight_res.headers.get("access-control-allow-origin") == "http://localhost:5173"
        assert preflight_res.headers.get("access-control-allow-credentials") == "true"
        print("✓ Preflight OPTIONS from http://localhost:5173 returned 200 with proper CORS headers")

        # 2. Test CORS actual request from http://localhost:5173
        login_res = await client.post(
            "/api/v1/auth/login",
            json={"username": "superadmin", "password": "superadmin123"},
            headers={"Origin": "http://localhost:5173"}
        )
        assert login_res.status_code == 200
        assert login_res.headers.get("access-control-allow-origin") == "http://localhost:5173"
        assert login_res.headers.get("access-control-allow-credentials") == "true"
        print("✓ Actual POST request from http://localhost:5173 returned 200 with proper CORS headers")

        # 3. Test CORS preflight from http://127.0.0.1:5173
        preflight_ip_res = await client.options(
            "/api/v1/appointments",
            headers={
                "Origin": "http://127.0.0.1:5173",
                "Access-Control-Request-Method": "GET",
                "Access-Control-Request-Headers": "authorization"
            }
        )
        assert preflight_ip_res.status_code == 200
        assert preflight_ip_res.headers.get("access-control-allow-origin") == "http://127.0.0.1:5173"
        print("✓ Preflight OPTIONS from http://127.0.0.1:5173 verified successfully via regex matching")

    print("\n" + "=" * 60)
    print("ALL CORS VERIFICATION TESTS PASSED SUCCESSFULLY!")
    print("=" * 60)


if __name__ == "__main__":
    asyncio.run(test_cors_preflight_and_actual_requests())
