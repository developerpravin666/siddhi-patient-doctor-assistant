# UI & API URL Configuration Guide

This document lists every file and variable that controls the **Frontend (UI)** and **Backend (API)** URLs, CORS origins, and Vite dev-server proxy settings. Click any citation link to jump directly to the exact file and line in your editor.

---

## Quick Reference Table

| Purpose | Variable / Setting | File & Line Citation |
| :--- | :--- | :--- |
| **Root API URL** | `PUBLIC_API_URL` | [`.env` (line 14)](file:///d:/Pravin/Projects/siddhi-patient-doctor-assistant/.env#L14) |
| **Root UI URL** | `PUBLIC_UI_URL` | [`.env` (line 15)](file:///d:/Pravin/Projects/siddhi-patient-doctor-assistant/.env#L15) |
| **Frontend Override API URL** | `VITE_API_BASE_URL` | [`frontend/.env` (line 6)](file:///d:/Pravin/Projects/siddhi-patient-doctor-assistant/frontend/.env#L6) |
| **Frontend Fallback API URL** | `DEFAULT_API_URL` | [`frontend/src/config.ts` (line 21)](file:///d:/Pravin/Projects/siddhi-patient-doctor-assistant/frontend/src/config.ts#L21) |
| **Frontend URL Resolver** | `getApiBaseUrl()` | [`frontend/src/config.ts` (lines 23–42)](file:///d:/Pravin/Projects/siddhi-patient-doctor-assistant/frontend/src/config.ts#L23-L42) |
| **Vite Dev Proxy Target** | `apiTarget` | [`frontend/vite.config.ts` (lines 7–8)](file:///d:/Pravin/Projects/siddhi-patient-doctor-assistant/frontend/vite.config.ts#L7-L8) |
| **Vite Dev Server Port** | `server.port` | [`frontend/vite.config.ts` (line 16)](file:///d:/Pravin/Projects/siddhi-patient-doctor-assistant/frontend/vite.config.ts#L16) |
| **Backend Server Port & Host** | `PORT`, `HOST` | [`backend/.env` (lines 6–7)](file:///d:/Pravin/Projects/siddhi-patient-doctor-assistant/backend/.env#L6-L7) |
| **Backend Allowed CORS Origins** | `CORS_ORIGINS` | [`backend/.env` (line 8)](file:///d:/Pravin/Projects/siddhi-patient-doctor-assistant/backend/.env#L8) |
| **Backend Default CORS List** | `Settings.CORS_ORIGINS` | [`backend/app/core/config.py` (lines 20–28)](file:///d:/Pravin/Projects/siddhi-patient-doctor-assistant/backend/app/core/config.py#L20-L28) |
| **Backend CORS Fallback List** | `parse_cors_origins` | [`backend/app/core/config.py` (lines 42–46)](file:///d:/Pravin/Projects/siddhi-patient-doctor-assistant/backend/app/core/config.py#L42-L46) |
| **Backend CORS Regex (Tunnels)** | `allow_origin_regex` | [`backend/app/main.py` (line 92)](file:///d:/Pravin/Projects/siddhi-patient-doctor-assistant/backend/app/main.py#L92) |

---

## 1. Frontend (UI & API Target) Configuration

### A. Root Environment File
- **`PUBLIC_API_URL`** — Base URL of the FastAPI backend: [`.env#L14`](file:///d:/Pravin/Projects/siddhi-patient-doctor-assistant/.env#L14)
- **`PUBLIC_UI_URL`** — Base URL of the React/Vite UI: [`.env#L15`](file:///d:/Pravin/Projects/siddhi-patient-doctor-assistant/.env#L15)

### B. Frontend Environment & Fallback
- **`VITE_API_BASE_URL`** — Frontend-specific API URL override (currently commented out): [`frontend/.env#L6`](file:///d:/Pravin/Projects/siddhi-patient-doctor-assistant/frontend/.env#L6)
- **`DEFAULT_API_URL`** — Hardcoded fallback used when `VITE_API_BASE_URL` and `localStorage.getItem('siddhi_api_base_url')` are not set: [`frontend/src/config.ts#L21`](file:///d:/Pravin/Projects/siddhi-patient-doctor-assistant/frontend/src/config.ts#L21)
- **`getApiBaseUrl()`** — Resolution priority (`localStorage` -> `import.meta.env.VITE_API_BASE_URL` -> `DEFAULT_API_URL`): [`frontend/src/config.ts#L23-L42`](file:///d:/Pravin/Projects/siddhi-patient-doctor-assistant/frontend/src/config.ts#L23-L42)

### C. Vite Dev Server & Proxy
- **`apiTarget`** — Proxies `/api` and `/webhook` requests during `npm run dev`: [`frontend/vite.config.ts#L7-L31`](file:///d:/Pravin/Projects/siddhi-patient-doctor-assistant/frontend/vite.config.ts#L7-L31)
- **`server.port`** — Local UI port (`5173`): [`frontend/vite.config.ts#L16`](file:///d:/Pravin/Projects/siddhi-patient-doctor-assistant/frontend/vite.config.ts#L16)

---

## 2. Backend (API & CORS) Configuration

- **`PORT` & `HOST`** — FastAPI bind host (`0.0.0.0`) and port (`8000`): [`backend/.env#L6-L7`](file:///d:/Pravin/Projects/siddhi-patient-doctor-assistant/backend/.env#L6-L7)
- **`CORS_ORIGINS`** — JSON list of allowed frontend origins in the backend environment file: [`backend/.env#L8`](file:///d:/Pravin/Projects/siddhi-patient-doctor-assistant/backend/.env#L8)
- **`Settings.CORS_ORIGINS`** — Default Pydantic settings origins list: [`backend/app/core/config.py#L20-L28`](file:///d:/Pravin/Projects/siddhi-patient-doctor-assistant/backend/app/core/config.py#L20-L28)
- **`Settings.get_cors_origins()`** — Merges `CORS_ORIGINS` with local dev defaults: [`backend/app/core/config.py#L48-L67`](file:///d:/Pravin/Projects/siddhi-patient-doctor-assistant/backend/app/core/config.py#L48-L67)
- **`allow_origin_regex`** — Regex permitting `localhost`, `127.0.0.1`, `*.trycloudflare.com`, `*.ngrok-free.app`, `*.ngrok.io`, and `*.loca.lt`: [`backend/app/main.py#L92`](file:///d:/Pravin/Projects/siddhi-patient-doctor-assistant/backend/app/main.py#L92)

---

## 3. When Changing URLs (Checklist)

1. Update the API URL in [`frontend/src/config.ts#L21`](file:///d:/Pravin/Projects/siddhi-patient-doctor-assistant/frontend/src/config.ts#L21) (`DEFAULT_API_URL`) and/or [`frontend/.env#L6`](file:///d:/Pravin/Projects/siddhi-patient-doctor-assistant/frontend/.env#L6) (`VITE_API_BASE_URL`), as well as [`.env#L14-L15`](file:///d:/Pravin/Projects/siddhi-patient-doctor-assistant/.env#L14-L15).
2. If you use a custom domain for the UI (not `localhost` or `*.trycloudflare.com`), add it to [`backend/.env#L8`](file:///d:/Pravin/Projects/siddhi-patient-doctor-assistant/backend/.env#L8) (`CORS_ORIGINS`).
3. Clear any browser override if set earlier: `localStorage.removeItem('siddhi_api_base_url')` (checked in [`frontend/src/config.ts#L28`](file:///d:/Pravin/Projects/siddhi-patient-doctor-assistant/frontend/src/config.ts#L28)).
4. Restart the Vite dev server (`npm run dev`) and FastAPI (`uvicorn`) after making changes.
