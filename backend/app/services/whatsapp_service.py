import logging
from typing import Dict, Any, List, Optional
import httpx
from app.core.config import settings
from app.core.security import mask_phone_number

logger = logging.getLogger("whatsapp_service")


class WhatsAppService:
    def __init__(self, phone_number_id: Optional[str] = None, access_token: Optional[str] = None):
        self.phone_number_id = (phone_number_id or settings.WHATSAPP_PHONE_NUMBER_ID or "").strip()
        self.access_token = (access_token or settings.WHATSAPP_ACCESS_TOKEN or "").strip()
        self.api_version = settings.WHATSAPP_API_VERSION or "v21.0"
        self.last_error: Optional[str] = None
        self._setup_client()

    def _setup_client(self):
        if self.phone_number_id:
            self.base_url = f"https://graph.facebook.com/{self.api_version}/{self.phone_number_id}"
        else:
            self.base_url = ""
        self.headers = {
            "Authorization": f"Bearer {self.access_token}",
            "Content-Type": "application/json"
        }

    def _is_configured(self) -> bool:
        return bool(
            self.phone_number_id
            and self.access_token
            and not self.phone_number_id.startswith("12345")
        )

    async def send_text_message(
        self,
        recipient_phone: str,
        text: str,
        custom_phone_number_id: Optional[str] = None,
        custom_access_token: Optional[str] = None
    ) -> bool:
        """
        Sends standard text message with WhatsApp markdown formatting.
        """
        self.last_error = None
        # Clean recipient phone number (remove spaces, plus, hyphens)
        clean_phone = "".join(filter(str.isdigit, recipient_phone))
        masked = mask_phone_number(clean_phone)
        logger.info(f"Sending WhatsApp message to {masked}:\n{text}")

        pid = custom_phone_number_id or self.phone_number_id
        tok = custom_access_token or self.access_token
        base_url = f"https://graph.facebook.com/{self.api_version}/{pid}" if pid else self.base_url
        headers = {
            "Authorization": f"Bearer {tok}",
            "Content-Type": "application/json"
        }

        if not pid or not tok or pid.startswith("12345"):
            logger.info(f"[SIMULATED WHATSAPP OUTBOUND to {masked}]:\n{text}")
            return True

        payload = {
            "messaging_product": "whatsapp",
            "recipient_type": "individual",
            "to": clean_phone,
            "type": "text",
            "text": {
                "preview_url": False,
                "body": text
            }
        }

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                res = await client.post(
                    f"{base_url}/messages",
                    headers=headers,
                    json=payload
                )
                if res.status_code in (200, 201):
                    logger.info(f"Successfully delivered WhatsApp message to {masked}")
                    return True
                else:
                    try:
                        err_json = res.json()
                        err_msg = err_json.get("error", {}).get("message", res.text)
                        err_code = err_json.get("error", {}).get("code", res.status_code)
                        self.last_error = f"Meta API Error ({err_code}): {err_msg}"
                    except Exception:
                        self.last_error = f"Meta API returned status {res.status_code}: {res.text}"
                    logger.error(f"WhatsApp API error ({res.status_code}): {self.last_error}")
                    return False
        except Exception as e:
            self.last_error = f"Network/Connection error: {str(e)}"
            logger.error(f"Failed to send WhatsApp message to {masked}: {e}")
            return False

    async def send_template_reminder(
        self,
        recipient_phone: str,
        patient_name: str,
        doctor_name: str,
        time_slot: str,
        clinic_address: str,
        custom_phone_number_id: Optional[str] = None,
        custom_access_token: Optional[str] = None
    ) -> bool:
        """
        Sends official WhatsApp Cloud API template message for 1-hour automated reminder.
        Template Name: appointment_reminder_1hr
        Parameters: {{1}}=Patient Name, {{2}}=Doctor Name, {{3}}=Time Slot, {{4}}=Clinic Address
        Falls back to formatted text message if template is not approved or fails.
        """
        clean_phone = "".join(filter(str.isdigit, recipient_phone))
        masked = mask_phone_number(clean_phone)
        logger.info(f"Sending appointment_reminder_1hr template to {masked}")

        pid = custom_phone_number_id or self.phone_number_id
        tok = custom_access_token or self.access_token
        base_url = f"https://graph.facebook.com/{self.api_version}/{pid}" if pid else self.base_url
        headers = {
            "Authorization": f"Bearer {tok}",
            "Content-Type": "application/json"
        }

        fallback_body = (
            f"Hello {patient_name},\n\n"
            f"⏰ *Appointment Reminder*\n"
            f"Your consultation with *{doctor_name}* is scheduled in 1 hour at *{time_slot}*.\n\n"
            f"📍 *Clinic Address:* {clinic_address}\n\n"
            f"Please arrive 10 minutes prior. If you need directions or need to reschedule, simply reply to this message."
        )

        if not pid or not tok or pid.startswith("12345"):
            logger.info(f"[SIMULATED WHATSAPP REMINDER TEMPLATE to {masked}]:\n{fallback_body}")
            return True

        payload = {
            "messaging_product": "whatsapp",
            "recipient_type": "individual",
            "to": clean_phone,
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
                    f"{base_url}/messages",
                    headers=headers,
                    json=payload
                )
                if res.status_code in (200, 201):
                    logger.info(f"Successfully sent WhatsApp reminder template to {masked}")
                    return True
                else:
                    logger.warning(
                        f"WhatsApp template API rejected ({res.status_code}): {res.text}. "
                        f"Falling back to formatted text message for {masked}."
                    )
                    # Fallback to direct text message in case template is pending Meta approval
                    return await self.send_text_message(
                        recipient_phone=clean_phone,
                        text=fallback_body,
                        custom_phone_number_id=pid,
                        custom_access_token=tok
                    )
        except Exception as e:
            logger.error(f"Exception sending WhatsApp template to {masked}: {e}. Retrying via text message.")
            return await self.send_text_message(
                recipient_phone=clean_phone,
                text=fallback_body,
                custom_phone_number_id=pid,
                custom_access_token=tok
            )


whatsapp_service = WhatsAppService()
