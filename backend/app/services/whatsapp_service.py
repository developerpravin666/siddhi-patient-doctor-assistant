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
                        err_obj = err_json.get("error", {})
                        err_msg = err_obj.get("message", res.text)
                        err_code = err_obj.get("code", res.status_code)
                        err_subcode = err_obj.get("error_subcode")
                        
                        hint = ""
                        if err_code == 190:
                            hint = " — The Meta Access Token is expired, invalid, or revoked. Please generate a fresh token (or a Permanent System User Token with 'whatsapp_business_messaging' permission) from Meta Business Manager / App Dashboard and update it in WhatsApp API & Bot settings."
                        elif err_code == 131030:
                            hint = " — Meta Sandbox restriction: Recipient phone number is not in your allowed list. Add and verify this number in Meta App Dashboard > WhatsApp > API Setup > Manage phone number list."
                        elif err_code == 100:
                            hint = " — Invalid parameter. Verify Phone Number ID, recipient number format (with country code, e.g. 919876543210), and payload."
                        
                        subcode_str = f", subcode: {err_subcode}" if err_subcode else ""
                        self.last_error = f"Meta API Error ({err_code}{subcode_str}): {err_msg}{hint}"
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


    async def send_hello_world_template(
        self,
        recipient_phone: str,
        custom_phone_number_id: Optional[str] = None,
        custom_access_token: Optional[str] = None
    ) -> bool:
        """
        Sends Meta's pre-approved 'hello_world' default template.
        Unlike free-form text messages, approved templates bypass Meta's 24-hour customer window rule!
        """
        self.last_error = None
        clean_phone = "".join(filter(str.isdigit, recipient_phone))
        masked = mask_phone_number(clean_phone)
        logger.info(f"Sending Meta pre-approved 'hello_world' template to {masked}")

        pid = custom_phone_number_id or self.phone_number_id
        tok = custom_access_token or self.access_token
        base_url = f"https://graph.facebook.com/{self.api_version}/{pid}" if pid else self.base_url
        headers = {
            "Authorization": f"Bearer {tok}",
            "Content-Type": "application/json"
        }

        if not pid or not tok or pid.startswith("12345"):
            logger.info(f"[SIMULATED HELLO_WORLD TEMPLATE to {masked}]")
            return True

        payload = {
            "messaging_product": "whatsapp",
            "to": clean_phone,
            "type": "template",
            "template": {
                "name": "hello_world",
                "language": {
                    "code": "en_US"
                }
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
                    logger.info(f"Successfully delivered hello_world template to {masked}")
                    return True
                else:
                    try:
                        err_json = res.json()
                        err_obj = err_json.get("error", {})
                        err_msg = err_obj.get("message", res.text)
                        err_code = err_obj.get("code", res.status_code)
                        err_subcode = err_obj.get("error_subcode")
                        subcode_str = f", subcode: {err_subcode}" if err_subcode else ""
                        self.last_error = f"Meta API Error ({err_code}{subcode_str}): {err_msg}"
                    except Exception:
                        self.last_error = f"Meta API returned status {res.status_code}: {res.text}"
                    logger.error(f"WhatsApp template error ({res.status_code}): {self.last_error}")
                    return False
        except Exception as e:
            self.last_error = f"Network/Connection error: {str(e)}"
            logger.error(f"Failed to send WhatsApp template to {masked}: {e}")
            return False


    async def subscribe_waba(
        self,
        waba_id: Optional[str] = None,
        access_token: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Subscribes the WhatsApp Business Account (WABA) to receive live webhook events.
        Without this, Meta developer portal test button works, but live inbound/outbound
        messages will NOT be forwarded to the webhook!
        Meta Endpoint: POST https://graph.facebook.com/{api_version}/{waba_id}/subscribed_apps
        """
        tok = access_token or self.access_token
        target_waba = (waba_id or settings.WHATSAPP_BUSINESS_ACCOUNT_ID or "").strip()
        if not target_waba or not tok:
            return {
                "success": False,
                "error": "WABA ID and Access Token are required to subscribe WABA."
            }

        url = f"https://graph.facebook.com/{self.api_version}/{target_waba}/subscribed_apps"
        headers = {
            "Authorization": f"Bearer {tok}",
            "Content-Type": "application/json"
        }
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                res = await client.post(url, headers=headers)
                data = res.json()
                if res.status_code in (200, 201) and data.get("success"):
                    logger.info(f"Successfully subscribed WABA {target_waba} to app webhooks!")
                    return {"success": True, "data": data}
                else:
                    err_msg = data.get("error", {}).get("message", res.text)
                    logger.error(f"Failed to subscribe WABA {target_waba}: {err_msg}")
                    return {"success": False, "error": err_msg, "raw": data}
        except Exception as e:
            logger.error(f"Exception subscribing WABA {target_waba}: {e}")
            return {"success": False, "error": str(e)}


whatsapp_service = WhatsAppService()
