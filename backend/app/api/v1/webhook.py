import logging
from typing import Dict, Any
from fastapi import APIRouter, Query, Response, status, Request, HTTPException, BackgroundTasks
from app.core.config import settings
from app.core import security
from app.services.orchestration_service import orchestration_pipeline
from app.services.session_service import session_service
from app.models.schemas import SimulatorChatRequest, SimulatorChatResponse

router = APIRouter(tags=["WhatsApp Webhook"])
logger = logging.getLogger("webhook")


@router.get("/webhook")
async def verify_webhook(
    hub_mode: str = Query(None, alias="hub.mode"),
    hub_verify_token: str = Query(None, alias="hub.verify_token"),
    hub_challenge: str = Query(None, alias="hub.challenge"),
):
    """
    Meta WhatsApp Cloud API Webhook Verification Endpoint.
    """
    logger.info(f"Received webhook verification request: mode={hub_mode}")
    if hub_mode == "subscribe" and hub_verify_token == settings.WHATSAPP_VERIFY_TOKEN:
        logger.info("WhatsApp webhook verified successfully.")
        return Response(content=hub_challenge, media_type="text/plain", status_code=status.HTTP_200_OK)

    logger.warning("Webhook verification failed: Invalid verify token.")
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Verification token mismatch")


@router.post("/webhook")
async def receive_whatsapp_event(request: Request, background_tasks: BackgroundTasks):
    """
    Meta WhatsApp Cloud API Inbound Message Receiver.
    Acknowledges within 2 seconds with 200 OK and delegates to background worker.
    """
    signature = request.headers.get("X-Hub-Signature-256", "")
    body_bytes = await request.body()

    # 1. Verify HMAC SHA-256 signature
    if not security.verify_whatsapp_signature(body_bytes, signature, settings.WHATSAPP_APP_SECRET):
        logger.warning("Rejected webhook event: Invalid HMAC signature")
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid signature")

    try:
        payload = await request.json()
    except Exception:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Malformed JSON")

    # 2. Extract message entry & ignore status notifications (sent, delivered, read)
    entries = payload.get("entry", [])
    if not entries:
        return {"status": "ignored_empty_entry"}

    entry = entries[0]
    changes = entry.get("changes", [{}])[0]
    value = changes.get("value", {})
    messages = value.get("messages", [])

    if not messages:
        return {"status": "ignored_non_message_event"}

    message = messages[0]
    message_id = message.get("id")
    from_number = message.get("from")
    message_type = message.get("type")

    # 3. Idempotency Check
    if message_id and await session_service.is_message_processed(message_id):
        logger.info(f"Duplicate message ignored: {message_id}")
        return {"status": "ignored_duplicate_message"}

    if message_id:
        await session_service.mark_message_processed(message_id)

    # 4. Extract message text
    text_content = ""
    if message_type == "text":
        text_content = message.get("text", {}).get("body", "").strip()
    elif message_type == "interactive":
        interactive_data = message.get("interactive", {})
        if interactive_data.get("type") == "button_reply":
            text_content = interactive_data.get("button_reply", {}).get("title", "")
        elif interactive_data.get("type") == "list_reply":
            text_content = interactive_data.get("list_reply", {}).get("title", "")

    if from_number and text_content:
        # 5. Offload to background worker to prevent WhatsApp timeout
        background_tasks.add_task(
            orchestration_pipeline.process_user_message,
            phone_number=from_number,
            message_text=text_content,
            send_whatsapp_reply=True
        )

    return {"status": "queued"}


@router.post("/webhook/simulate", response_model=SimulatorChatResponse)
async def simulate_whatsapp_chat(req: SimulatorChatRequest):
    """
    Interactive Live Simulator endpoint for testing conversational flow
    directly from Admin Portal without needing an active WhatsApp phone setup.
    """
    reply_text, updated_session, tools_executed = await orchestration_pipeline.process_user_message(
        phone_number=req.phone_number,
        message_text=req.message_text,
        send_whatsapp_reply=False
    )

    return {
        "reply_text": reply_text,
        "session_state": updated_session,
        "tools_executed": tools_executed
    }


@router.post("/webhook/reset-session")
async def reset_session(req: SimulatorChatRequest):
    """
    Resets the conversation session for the given phone number.
    """
    await session_service.reset_session(req.phone_number)
    return {"status": "SUCCESS", "message": f"Session cleared for {req.phone_number}"}
