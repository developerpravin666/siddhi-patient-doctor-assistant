import logging
from typing import Dict, Any, List, Optional
import httpx
from app.core.config import settings
from app.core.security import mask_phone_number

logger = logging.getLogger("whatsapp_service")


class WhatsAppService:
    def __init__(self):
        self.base_url = f"https://graph.facebook.com/{settings.WHATSAPP_API_VERSION}/{settings.WHATSAPP_PHONE_NUMBER_ID}"
        self.headers = {
            "Authorization": f"Bearer {settings.WHATSAPP_ACCESS_TOKEN}",
            "Content-Type": "application/json"
        }

    def _is_configured(self) -> bool:
        return bool(
            settings.WHATSAPP_PHONE_NUMBER_ID
            and settings.WHATSAPP_ACCESS_TOKEN
            and not settings.WHATSAPP_PHONE_NUMBER_ID.startswith("12345")
        )

    async def send_text_message(self, recipient_phone: str, text: str) -> bool:
        """
        Sends standard text message with WhatsApp markdown formatting.
        """
        masked = mask_phone_number(recipient_phone)
        logger.info(f"Sending WhatsApp message to {masked}:\n{text}")

        if not self._is_configured():
            logger.info(f"[SIMULATED WHATSAPP OUTBOUND to {masked}]:\n{text}")
            return True

        payload = {
            "messaging_product": "whatsapp",
            "recipient_type": "individual",
            "to": recipient_phone,
            "type": "text",
            "text": {
                "preview_url": False,
                "body": text
            }
        }

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                res = await client.post(
                    f"{self.base_url}/messages",
                    headers=self.headers,
                    json=payload
                )
                if res.status_code in (200, 201):
                    logger.info(f"Successfully delivered WhatsApp message to {masked}")
                    return True
                else:
                    logger.error(f"WhatsApp API error ({res.status_code}): {res.text}")
                    return False
        except Exception as e:
            logger.error(f"Failed to send WhatsApp message to {masked}: {e}")
            return False

    async def send_template_reminder(
        self,
        recipient_phone: str,
        patient_name: str,
        doctor_name: str,
        time_slot: str,
        clinic_address: str
    ) -> bool:
        """
        Sends official WhatsApp Cloud API template message for 1-hour automated reminder.
        Template Name: appointment_reminder_1hr
        Parameters: {{1}}=Patient Name, {{2}}=Doctor Name, {{3}}=Time Slot, {{4}}=Clinic Address
        """
        masked = mask_phone_number(recipient_phone)
        logger.info(f"Sending appointment_reminder_1hr template to {masked}")

        if not self._is_configured():
            mock_body = (
                f"Hello {patient_name},\n\n"
                f"This is a friendly reminder that your appointment with {doctor_name} is scheduled in 1 hour at {time_slot}.\n\n"
                f"📍 Clinic Location: {clinic_address}\n\n"
                f"Please arrive 10 minutes early. If you need directions or need to reschedule, reply to this message."
            )
            logger.info(f"[SIMULATED WHATSAPP REMINDER TEMPLATE to {masked}]:\n{mock_body}")
            return True

        payload = {
            "messaging_product": "whatsapp",
            "recipient_type": "individual",
            "to": recipient_phone,
            "type": "template",
            "template": {
                "name": "appointment_reminder_1hr",
                "language": {"code": "en_US"},
                "components": [
                    {
                        "type": "body",
                        "parameters": [
                            {"type": "text", "text": patient_name},
                            {"type": "text", "text": doctor_name},
                            {"type": "text", "text": time_slot},
                            {"type": "text", "text": clinic_address}
                        ]
                    }
                ]
            }
        }

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                res = await client.post(
                    f"{self.base_url}/messages",
                    headers=self.headers,
                    json=payload
                )
                if res.status_code in (200, 201):
                    logger.info(f"Successfully sent WhatsApp reminder template to {masked}")
                    return True
                else:
                    logger.error(f"WhatsApp template API error ({res.status_code}): {res.text}")
                    return False
        except Exception as e:
            logger.error(f"Exception sending WhatsApp template to {masked}: {e}")
            return False


whatsapp_service = WhatsAppService()
