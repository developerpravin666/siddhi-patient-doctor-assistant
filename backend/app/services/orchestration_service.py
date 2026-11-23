import logging
from typing import Dict, Any, Tuple
from app.services.session_service import session_service
from app.services.gemini_service import gemini_service
from app.services.whatsapp_service import whatsapp_service
from app.core.security import mask_phone_number

logger = logging.getLogger("orchestration_service")


class OrchestrationPipeline:
    @staticmethod
    async def process_user_message(
        phone_number: str,
        message_text: str,
        send_whatsapp_reply: bool = True,
        recipient_phone_number_id: str = '',
        tenant_schema: str = ''
    ) -> Tuple[str, Dict[str, Any], list]:
        """
        Orchestration pipeline:
        1. Fetch or initialize user session state from Redis/Memory
        2. Run Gemini conversational turn with tool calling & guardrails
        3. Persist updated session state and multi-turn history
        4. Send formatted response back to WhatsApp
        """
        masked = mask_phone_number(phone_number)
        logger.info(f"Processing inbound message from {masked}: '{message_text}'")

        # 1. Fetch current session
        session = await session_service.get_session(phone_number)
        if tenant_schema:
            session["tenant_schema"] = tenant_schema

        # 2. Extract multi-turn history
        history = session.get("history", [])

        # 3. Run conversational turn
        reply_text, executed_tools, updated_session = await gemini_service.run_turn(
            user_message=message_text,
            history=history,
            session_state=session
        )

        # 4. Append to multi-turn conversation history
        history.append({"role": "user", "parts": [message_text]})
        history.append({"role": "model", "parts": [reply_text]})
        updated_session["history"] = history[-10:]  # Keep last 10 turns

        # 5. Save updated session
        await session_service.save_session(phone_number, updated_session)

        # 6. Send WhatsApp message if inbound from real webhook
        if send_whatsapp_reply:
            eff_phone_id = recipient_phone_number_id or ''
            eff_token = None
            sch = updated_session.get("tenant_schema") or tenant_schema
            if sch:
                try:
                    from app.core.database import AsyncSessionLocal, is_postgres
                    from app.models.domain import Clinic
                    from sqlalchemy import select, text
                    async with AsyncSessionLocal() as dbs:
                        if is_postgres():
                            await dbs.execute(text(f'SET search_path TO "{sch}", public;'))
                        c_res = await dbs.execute(select(Clinic).limit(1))
                        c_obj = c_res.scalar_one_or_none()
                        if c_obj:
                            if not eff_phone_id and c_obj.whatsapp_phone_number_id:
                                eff_phone_id = c_obj.whatsapp_phone_number_id
                            if c_obj.whatsapp_access_token:
                                eff_token = c_obj.whatsapp_access_token
                except Exception as ex:
                    logger.warning(f"Could not load custom credentials for schema {sch}: {ex}")

            await whatsapp_service.send_text_message(
                recipient_phone=phone_number,
                text=reply_text,
                custom_phone_number_id=eff_phone_id or None,
                custom_access_token=eff_token or None
            )

        return reply_text, updated_session, executed_tools


orchestration_pipeline = OrchestrationPipeline()
