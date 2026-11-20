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
            await whatsapp_service.send_text_message(
                recipient_phone=phone_number,
                text=reply_text,
                custom_phone_number_id=recipient_phone_number_id
            )

        return reply_text, updated_session, executed_tools


orchestration_pipeline = OrchestrationPipeline()
