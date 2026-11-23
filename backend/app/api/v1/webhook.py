import logging
from typing import Dict, Any, Optional
from fastapi import APIRouter, Query, Response, status, Request, HTTPException, BackgroundTasks
from app.core.config import settings
from app.core import security
from app.core.database import AsyncSessionLocal, is_postgres, sanitize_schema_name
from app.models.domain import Clinic, Tenant
from sqlalchemy import select, text
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
    Validates hub.verify_token against global settings or clinic configurations.
    """
    logger.info(f"Received webhook verification request: mode={hub_mode}")
    if hub_mode == "subscribe":
        # 1. Check against global settings token
        if hub_verify_token and hub_verify_token == settings.WHATSAPP_VERIFY_TOKEN:
            logger.info("WhatsApp webhook verified successfully via settings token.")
            return Response(content=hub_challenge, media_type="text/plain", status_code=status.HTTP_200_OK)

        # 2. Check against clinic database custom tokens
        if hub_verify_token:
            try:
                async with AsyncSessionLocal() as session:
                    if is_postgres():
                        stmt = select(Tenant.schema_name).where(Tenant.is_active == True)
                        res = await session.execute(stmt)
                        schemas = [r[0] for r in res.fetchall() if r[0]]
                        for sch in schemas:
                            await session.execute(text(f'SET search_path TO "{sch}", public;'))
                            c_res = await session.execute(
                                select(Clinic).where(Clinic.whatsapp_verify_token == hub_verify_token)
                            )
                            if c_res.scalar_one_or_none():
                                logger.info(f"WhatsApp webhook verified successfully via tenant schema '{sch}'.")
                                return Response(content=hub_challenge, media_type="text/plain", status_code=status.HTTP_200_OK)
                    else:
                        c_res = await session.execute(
                            select(Clinic).where(Clinic.whatsapp_verify_token == hub_verify_token)
                        )
                        if c_res.scalar_one_or_none():
                            logger.info("WhatsApp webhook verified successfully via clinic table.")
                            return Response(content=hub_challenge, media_type="text/plain", status_code=status.HTTP_200_OK)
            except Exception as e:
                logger.warning(f"Error checking clinic-specific verify tokens: {e}")

    logger.warning("Webhook verification failed: Invalid verify token.")
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Verification token mismatch")


async def save_webhook_event_record(
    event_type: str,
    status_val: str,
    sender_phone: Optional[str] = None,
    recipient_phone_id: Optional[str] = None,
    message_id: Optional[str] = None,
    message_body: Optional[str] = None,
    error_message: Optional[str] = None,
    raw_payload: Optional[Dict[str, Any]] = None,
    headers: Optional[Dict[str, Any]] = None,
):
    """
    Persists incoming Meta WhatsApp webhook events into public.webhook_events for auditing & debugging.
    """
    try:
        from app.models.domain import WebhookEvent
        import uuid

        async with AsyncSessionLocal() as session:
            if is_postgres():
                await session.execute(text('SET search_path TO public;'))
            event = WebhookEvent(
                id=str(uuid.uuid4()),
                event_type=event_type,
                sender_phone=sender_phone,
                recipient_phone_id=recipient_phone_id,
                message_id=message_id,
                message_body=message_body,
                status=status_val,
                error_message=error_message,
                raw_payload=raw_payload,
                headers=headers
            )
            session.add(event)
            await session.commit()
            logger.info(f"Persisted webhook event to DB: id={event.id}, type={event_type}, status={status_val}, sender={sender_phone}")
    except Exception as e:
        logger.error(f"Error persisting webhook event to database: {e}", exc_info=True)


async def resolve_webhook_tenant_schema(recipient_phone_id: Optional[str]) -> str:
    """
    Resolves the target tenant schema for incoming webhook messages.
    Searches active clinics matching the incoming phone_number_id, or defaults to the active tenant schema.
    """
    try:
        async with AsyncSessionLocal() as session:
            if is_postgres():
                await session.execute(text('SET search_path TO public;'))
                stmt = select(Tenant.schema_name).where(Tenant.status == "ACTIVE")
                res = await session.execute(stmt)
                schemas = [r[0] for r in res.fetchall() if r[0]]

                if recipient_phone_id:
                    for sch in schemas:
                        safe_sch = sanitize_schema_name(sch)
                        await session.execute(text(f'SET search_path TO "{safe_sch}", public;'))
                        c_res = await session.execute(
                            select(Clinic).where(Clinic.whatsapp_phone_number_id == recipient_phone_id)
                        )
                        if c_res.scalar_one_or_none():
                            return safe_sch

                if schemas:
                    return sanitize_schema_name(schemas[0])

                return "public"
            else:
                return "public"
    except Exception as e:
        logger.warning(f"Error resolving tenant schema for webhook message: {e}")
        return "public"


@router.post("/webhook")
async def receive_whatsapp_event(request: Request, background_tasks: BackgroundTasks):
    """
    Meta WhatsApp Cloud API Inbound Message Receiver.
    Acknowledges within 2 seconds with 200 OK and delegates to background worker.
    Stores every webhook event in the database for auditing and live monitoring.
    """
    body_bytes = await request.body()
    signature = request.headers.get("X-Hub-Signature-256", "")
    logger.info(f"Incoming WhatsApp webhook POST: {len(body_bytes)} bytes, sig_present={bool(signature)}")
    req_headers = {
        "x-hub-signature-256": signature,
        "content-type": request.headers.get("content-type", ""),
        "user-agent": request.headers.get("user-agent", ""),
        "host": request.headers.get("host", ""),
    }

    # 1. Verify HMAC SHA-256 signature
    if not security.verify_whatsapp_signature(body_bytes, signature, settings.WHATSAPP_APP_SECRET):
        logger.warning("Rejected webhook event: Invalid HMAC signature")
        await save_webhook_event_record(
            event_type="signature_failure",
            status_val="FAILED",
            error_message="Invalid HMAC signature (X-Hub-Signature-256 mismatch)",
            headers=req_headers
        )
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid signature")

    try:
        payload = await request.json()
    except Exception as e:
        await save_webhook_event_record(
            event_type="malformed_json",
            status_val="FAILED",
            error_message=f"Malformed JSON: {str(e)}",
            headers=req_headers
        )
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Malformed JSON")

    # 2. Extract message entry & ignore status notifications (sent, delivered, read)
    entries = payload.get("entry", [])
    if not entries:
        await save_webhook_event_record(
            event_type="empty_entry",
            status_val="IGNORED",
            raw_payload=payload,
            headers=req_headers
        )
        return {"status": "ignored_empty_entry"}

    entry = entries[0]
    changes = entry.get("changes", [{}])[0]
    value = changes.get("value", {})
    messages = value.get("messages", [])
    statuses = value.get("statuses", [])

    metadata = value.get("metadata", {})
    recipient_phone_id = metadata.get("phone_number_id")

    if not messages:
        # Record delivery receipts (sent, delivered, read)
        if statuses:
            st = statuses[0]
            st_val = st.get("status", "unknown")
            rec_id = st.get("recipient_id")
            msg_id = st.get("id")

            # Extract detailed error if delivery failed
            err_list = st.get("errors", [])
            err_msg = None
            status_val = "STATUS_UPDATE"
            if err_list:
                err_item = err_list[0]
                err_code = err_item.get("code")
                err_title = err_item.get("title") or err_item.get("message")
                err_details = err_item.get("error_data", {}).get("details")
                err_msg = f"Meta Error ({err_code}): {err_title}"
                if err_details:
                    err_msg += f" — {err_details}"
                if st_val == "failed":
                    status_val = "FAILED"
            elif st_val == "failed":
                status_val = "FAILED"
                err_msg = "Delivery failed by Meta"

            await save_webhook_event_record(
                event_type=f"status_{st_val}",
                status_val=status_val,
                sender_phone=rec_id,
                recipient_phone_id=recipient_phone_id,
                message_id=msg_id,
                message_body=f"Message status: {st_val}",
                error_message=err_msg,
                raw_payload=payload,
                headers=req_headers
            )
            return {"status": f"status_{st_val}_recorded"}

        await save_webhook_event_record(
            event_type="non_message",
            status_val="IGNORED",
            recipient_phone_id=recipient_phone_id,
            raw_payload=payload,
            headers=req_headers
        )
        return {"status": "ignored_non_message_event"}

    message = messages[0]
    message_id = message.get("id")
    from_number = message.get("from")
    message_type = message.get("type", "unknown")

    # 3. Idempotency Check
    if message_id and await session_service.is_message_processed(message_id):
        logger.info(f"Duplicate message ignored: {message_id}")
        await save_webhook_event_record(
            event_type=f"message_{message_type}",
            status_val="DUPLICATE",
            sender_phone=from_number,
            recipient_phone_id=recipient_phone_id,
            message_id=message_id,
            raw_payload=payload,
            headers=req_headers
        )
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

    # Save event into database
    await save_webhook_event_record(
        event_type=f"message_{message_type}",
        status_val="PROCESSED" if (from_number and text_content) else "IGNORED",
        sender_phone=from_number,
        recipient_phone_id=recipient_phone_id,
        message_id=message_id,
        message_body=text_content or f"[{message_type} message without text]",
        raw_payload=payload,
        headers=req_headers
    )

    if from_number and text_content:
        # 5. Offload to background worker to prevent WhatsApp timeout
        tenant_sch = await resolve_webhook_tenant_schema(recipient_phone_id)
        background_tasks.add_task(
            orchestration_pipeline.process_user_message,
            phone_number=from_number,
            message_text=text_content,
            send_whatsapp_reply=True,
            recipient_phone_number_id=recipient_phone_id,
            tenant_schema=tenant_sch
        )

    return {"status": "queued"}


@router.post("/webhook/simulate", response_model=SimulatorChatResponse)
async def simulate_whatsapp_chat(req: SimulatorChatRequest):
    """
    Interactive Live Simulator endpoint for testing conversational flow
    directly from Admin Portal without needing an active WhatsApp phone setup.
    Also logs the simulated interaction into webhook_events.
    """
    reply_text, updated_session, tools_executed = await orchestration_pipeline.process_user_message(
        phone_number=req.phone_number,
        message_text=req.message_text,
        send_whatsapp_reply=False
    )

    # Record simulated event into webhook_events for super admin inspection
    await save_webhook_event_record(
        event_type="simulator_chat",
        status_val="SIMULATED",
        sender_phone=req.phone_number,
        message_body=req.message_text,
        raw_payload={
            "phone_number": req.phone_number,
            "message_text": req.message_text,
            "reply_text": reply_text,
            "tools_executed": tools_executed
        }
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
