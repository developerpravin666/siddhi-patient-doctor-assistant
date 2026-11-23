# WhatsApp Cloud API Configuration & Setup Guide
### Siddhi Patient-Doctor Assistant

This guide provides end-to-end instructions for configuring, deploying, testing, and maintaining the **Meta WhatsApp Cloud API** integration in the Siddhi Patient-Doctor Assistant platform.

---

## Table of Contents
1. [Overview & Architecture](#1-overview--architecture)
2. [Prerequisites](#2-prerequisites)
3. [Step 1: Create Meta Developer App](#step-1-create-meta-developer-app)
4. [Step 2: Obtain WhatsApp Cloud API Credentials](#step-2-obtain-whatsapp-cloud-api-credentials)
5. [Step 3: Generate a Permanent System User Token](#step-3-generate-a-permanent-system-user-token)
6. [Step 4: Configure Webhooks in Meta](#step-4-configure-webhooks-in-meta)
7. [Step 5: Create WhatsApp Reminder Template](#step-5-create-whatsapp-reminder-template)
8. [Step 6: Configure Credentials in the Clinic Portal](#step-6-configure-credentials-in-the-clinic-portal)
9. [Step 7: Testing & Verification](#step-7-testing--verification)
10. [Local Development & Webhook Tunneling](#local-development--webhook-tunneling)
11. [Troubleshooting & Common Meta Errors](#troubleshooting--common-meta-errors)

---

## 1. Overview & Architecture

The WhatsApp integration connects patients directly to the clinic's AI Medical Receptionist:

```
[Patient on WhatsApp] 
        │ (Inbound Message)
        ▼
[Meta Cloud API] 
        │ (HTTP POST with HMAC SHA-256)
        ▼
[FastAPI Backend: /api/v1/webhook] 
        │ (Fast 200 OK + Async Background Worker)
        ▼
[Orchestration Pipeline & Redis Session Memory]
        │ (Multi-turn Context & Guardrails)
        ▼
[Gemini 2.5 Flash Agent with Tool Calling]
        ├── get_available_slots()  ──► [PostgreSQL Database]
        └── book_appointment()     ──► [PostgreSQL Database]
        │
        ▼ (Formatted Markdown Reply)
[Meta Cloud API Outbound: /v21.0/{phone_number_id}/messages]
        │
        ▼
[Patient on WhatsApp]
```

### Key Capabilities
- **Automated Conversational Booking**: 5-step interactive conversation (Greeting &rarr; Name &rarr; Phone &rarr; Dynamic Database Slots &rarr; Confirmation).
- **Multi-Tenant Schema Isolation**: Independent WhatsApp credentials and doctor schedules per clinic.
- **Medical Safety Guardrails**: Zero medical advice enforcement and immediate emergency protocol handoff (112 / 911 / 108).
- **Automated 1-Hour Reminders**: Background cron worker (`reminder_service.py`) sends WhatsApp template reminders to patients 1 hour before scheduled consultations.
- **Simulated Sandbox Fallback**: Works out-of-the-box in simulated mode if live Meta credentials are not yet configured.

---

## 2. Prerequisites

Before starting, ensure you have:
1. A **[Meta for Developers Account](https://developers.facebook.com/)**.
2. A **[Meta Business Account (Business Portfolio)](https://business.facebook.com/)**.
3. A publicly accessible HTTPS URL for the backend webhook (e.g. `https://your-clinic-domain.com` or an `ngrok` / `Cloudflare` tunnel for local dev).
4. A phone number for WhatsApp:
   - For **Development/Testing**: Use the free Meta Sandbox test number.
   - For **Production**: A clean mobile or landline number not currently registered on personal WhatsApp.

---

## 3. Step 1: Create Meta Developer App

1. Log in to [Meta for Developers](https://developers.facebook.com/).
2. Click **My Apps** in the top navigation bar &rarr; click **Create App**.
3. Under **App Type**, select **Other** (or **Business**) &rarr; click **Next**.
4. Select **Business** as the app use case &rarr; click **Next**.
5. Enter your App Details:
   - **App Name**: `Siddhi Patient Assistant` (or your clinic name).
   - **App Contact Email**: Your admin email.
   - **Business Account**: Select your Meta Business Portfolio.
6. Click **Create App** and complete the security verification.

---

## 4. Step 2: Obtain WhatsApp Cloud API Credentials

1. On the App Dashboard, scroll down to **Add Products to Your App**.
2. Locate **WhatsApp** &rarr; click **Set Up**.
3. In the left sidebar, navigate to **WhatsApp** &rarr; **API Setup**.
4. You will see:
   - **Temporary Access Token** (valid for 24 hours).
   - **Phone Number ID** (e.g., `524189020786543`).
   - **WhatsApp Business Account ID (WABA ID)** (e.g., `104589201948203`).
5. **Add Test Recipient Numbers (Required for Sandbox)**:
   - Under the **To** field, click the recipient dropdown &rarr; click **Manage phone number list**.
   - Add your personal mobile number (including country code, e.g., `919009368666`).
   - Meta will send a 6-digit verification code to that WhatsApp number. Enter the code to verify.
   > **Important Note:** In sandbox mode, Meta Cloud API can ONLY send messages to verified test numbers.

---

## 5. Step 3: Generate a Permanent System User Token

> ⚠️ The 24-hour Temporary Access Token generated on the API Setup page will expire. For production and continuous clinic operation, you **must** generate a Permanent System User Token.

1. Go to **[Meta Business Settings](https://business.facebook.com/settings)**.
2. Select your Business Account.
3. In the left sidebar, go to **Users** &rarr; **System Users**.
4. Click **Add**:
   - **System User Name**: `siddhi-api-user`
   - **System User Role**: `Admin`
   - Click **Create System User**.
5. Assign Assets to the System User:
   - Click **Add Assets**.
   - Select **Apps** &rarr; select your App (`Siddhi Patient Assistant`) &rarr; grant **Full Control (Manage App)**.
   - Select **WhatsApp Accounts** &rarr; select your WhatsApp Account &rarr; grant **Full Control (Manage WhatsApp Business Account)**.
   - Click **Save Changes**.
6. Generate the Token:
   - Click **Generate New Token**.
   - Select your App.
   - Under **Token Expiration**, select **Never** (Permanent).
   - Under **Available Permissions**, select:
     - `whatsapp_business_messaging`
     - `whatsapp_business_management`
   - Click **Generate Token**.
7. Copy the generated token immediately (starts with `EAAG...`). Store it safely; Meta will not display it again.

---

## 6. Step 4: Configure Webhooks in Meta

Webhooks allow Meta to deliver incoming patient messages to the Siddhi Assistant in real time.

1. In the Meta App Dashboard, navigate to **WhatsApp** &rarr; **Configuration** in the left sidebar.
2. Under **Webhook**, click **Edit**:
   - **Callback URL**: `https://<YOUR-DOMAIN>/api/v1/webhook`
     *(Example: `https://api.clinic.com/api/v1/webhook` or `https://abcd-123.ngrok-free.app/api/v1/webhook`)*
   - **Verify Token**: `siddhi_patient_assistant_verify_token_secure_2026`
     *(Or the custom token you set in clinic settings)*
3. Click **Verify and Save**.
   - Meta will send an HTTP `GET` request to your backend with `hub.mode=subscribe`. The backend validates the verify token and returns HTTP 200 with `hub.challenge`.
4. Subscribe to Webhook Fields:
   - Under **Webhook Fields**, click **Manage**.
   - Find the **`messages`** row &rarr; click **Subscribe**.
   - Click **Done**.

---

## 7. Step 5: Create WhatsApp Reminder Template

The automated appointment reminder scheduler uses Meta's approved message template.

1. In Meta App Dashboard, go to **WhatsApp** &rarr; **API Setup**.
2. Click **Create Message Template** (or visit WhatsApp Manager &rarr; Account tools &rarr; Message templates).
3. Click **Create Template**:
   - **Category**: `Utility`
   - **Name**: `appointment_reminder_1hr`
   - **Language**: `English (US)` (`en_US`)
4. In the **Body** text box, enter:
   ```
   Hello {{1}},

   This is a friendly reminder that your appointment with {{2}} is scheduled in 1 hour at {{3}}.

   📍 Clinic Location: {{4}}

   Please arrive 10 minutes early. If you need directions or need to reschedule, reply to this message.
   ```
5. Add Sample Values for Meta Approval:
   - `{{1}}`: `Rahul Sharma`
   - `{{2}}`: `Dr. Siddhi Patel`
   - `{{3}}`: `10:30 AM`
   - `{{4}}`: `Suite 402, Siddhi Medical Enclave, Central Avenue`
6. Click **Submit for Review**. Approval usually takes 1 to 5 minutes.
> **Resilience Fallback:** If the template is pending approval or rejected, the Siddhi assistant automatically falls back to sending a formatted direct text message so reminders are never dropped.

---

## 8. Step 6: Configure Credentials in the Clinic Portal

1. Log in to the Siddhi Assistant Admin Portal:
   - Default Super Admin: `superadmin` / `superadmin123`
   - Or your Clinic Admin account.
2. In the sidebar, navigate to **Settings** &rarr; **WhatsApp Configuration** (`/settings/whatsapp`).
3. Fill in the configuration fields:
   - **WhatsApp Phone Number ID**: Paste your Meta Phone Number ID (e.g. `524189020786543`).
   - **WhatsApp Business Account ID**: Paste your WABA ID.
   - **Permanent Access Token**: Paste your System User Token (`EAAG...`).
   - **Webhook Verify Token**: `siddhi_patient_assistant_verify_token_secure_2026`.
4. Configure Patient Booking Flow:
   - **Allow Patient to Select Doctor & Specialization**: Turn ON if you have multiple doctors.
   - **Primary / Default Doctor**: Select the primary consulting doctor.
   - **Welcome Message**: Customize the clinic's initial greeting.
   - **Automated Reminder Window**: Default is `60 Minutes (1 Hour) Before`.
   - **Enable AI Receptionist Bot**: Turn ON.
5. Click **Save WhatsApp Configuration**.
6. The status badge at the top will change to **`WhatsApp Live: Active`**.

---

## 9. Step 7: Testing & Verification

### Test A: In-Portal Live Test Ping
1. On the WhatsApp Configuration page, scroll down to **Test WhatsApp Connection & Message Dispatch**.
2. Enter your mobile number with country code (e.g. `919009368666`).
3. Click **Send Live Test Ping**.
4. Check the result:
   - **Success**: You will receive a WhatsApp message on your phone confirming connection.
   - **Failure**: The portal displays the exact error message from Meta (e.g. expired token, invalid number, or sandbox opt-in needed).

### Test B: WhatsApp Simulator
1. In the sidebar, navigate to **WhatsApp Simulator** (`/simulator`).
2. Test full booking workflows directly inside the browser:
   - Type `"Hi, I'd like to book an appointment tomorrow"`.
   - Provide name & mobile number.
   - Select an available slot from the dynamic database options.
   - Verify appointment confirmation.
   - Switch to **Appointments** (`/appointments`) to see the confirmed appointment in the queue.

### Test C: Live End-to-End Chat from WhatsApp
1. Open WhatsApp on your phone.
2. Send a message `"Hello"` to your Meta WhatsApp Business Phone Number.
3. The AI receptionist will reply within 1-2 seconds with the clinic welcome message.
4. Complete the booking conversation.

---

## 10. Local Development & Webhook Tunneling

Since Meta requires a valid public HTTPS endpoint to deliver webhooks, use a tunnel for local development:

### Option A: Using ngrok
```powershell
# 1. Start your local FastAPI backend (port 8000)
cd backend
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload

# 2. In another terminal, start ngrok
ngrok http 8000
```
- Copy the HTTPS forwarding URL (e.g. `https://xxxx-xx-xx.ngrok-free.app`).
- Set Callback URL in Meta to: `https://xxxx-xx-xx.ngrok-free.app/api/v1/webhook`.

### Option B: Using Cloudflare Tunnel
```powershell
cloudflared tunnel --url http://localhost:8000
```
- Set Callback URL in Meta to: `https://<tunnel-id>.trycloudflare.com/api/v1/webhook`.

---

## 11. Troubleshooting & Common Meta Errors

| Error Code / Message | Cause | Resolution |
| :--- | :--- | :--- |
| **`(#131030) Recipient phone number not in allowed list`** | You are using the Meta Sandbox test number and the recipient number has not been verified. | Go to Meta Developer Dashboard &rarr; WhatsApp &rarr; API Setup &rarr; click **To** &rarr; **Manage phone number list** &rarr; add the recipient number and verify via OTP. |
| **`(#190) Invalid OAuth access token`** | Temporary token has expired or token was revoked. | Generate a Permanent System User Token from Meta Business Settings (Step 3) and save it in the portal. |
| **`Verification token mismatch` (HTTP 403)** | The Verify Token entered in Meta does not match the token in the backend. | Ensure both match exactly: `siddhi_patient_assistant_verify_token_secure_2026` (or copy from the portal). |
| **`No messages received from webhook`** | The `messages` field is not subscribed in Meta. | Go to Meta Dashboard &rarr; WhatsApp &rarr; Configuration &rarr; Webhook &rarr; click **Manage** &rarr; check **`messages`** &rarr; Save. |
| **`24-Hour Messaging Window Error`** | Free-form text messages can only be sent within 24 hours of the patient's last message. | Outside 24 hours, only approved Meta Templates (such as `appointment_reminder_1hr`) can initiate conversations. |
| **`Signature verification failed` (HTTP 401)** | `WHATSAPP_APP_SECRET` in `.env` does not match the App Secret in Meta Dashboard. | Copy your App Secret from Meta App Dashboard &rarr; Settings &rarr; Basic &rarr; App Secret, and set `WHATSAPP_APP_SECRET` in your backend `.env`. |

---

## Maintenance & Upgrading to Production Live Number

When moving from developer test numbers to a real clinic phone number:
1. In Meta Business Settings, ensure your **Business Portfolio is Verified**.
2. Go to **WhatsApp Manager** &rarr; **Phone numbers** &rarr; **Add Phone Number**.
3. Enter your clinic phone number and display name (e.g., `Dr. Siddhi Clinic`).
4. Verify ownership via SMS or Voice Call OTP.
5. In the Siddhi Portal, update the **Phone Number ID** to the new production Phone Number ID.
6. Verify your payment method in Meta Business Manager to enable standard WhatsApp tier pricing.

---
*Maintained by Siddhi Patient-Doctor Assistant Core Team • Last Updated November 2026*
