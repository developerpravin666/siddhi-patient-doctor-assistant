from typing import Dict, Any, Callable
from app.tools.appointment_tools import get_available_slots, book_appointment

TOOL_DISPATCHER: Dict[str, Callable] = {
    "get_available_slots": get_available_slots,
    "book_appointment": book_appointment,
}

TOOL_DECLARATIONS = [
    {
        "name": "get_available_slots",
        "description": "Queries open doctor appointment time slots for a specified date.",
        "parameters": {
            "type": "OBJECT",
            "properties": {
                "date": {
                    "type": "STRING",
                    "description": "The date in YYYY-MM-DD format, or 'today' or 'tomorrow'."
                }
            },
            "required": ["date"]
        }
    },
    {
        "name": "book_appointment",
        "description": "Books and confirms a doctor appointment in the database.",
        "parameters": {
            "type": "OBJECT",
            "properties": {
                "patient_name": {
                    "type": "STRING",
                    "description": "Full name of the patient."
                },
                "mobile_number": {
                    "type": "STRING",
                    "description": "10-digit mobile phone number of the patient."
                },
                "date": {
                    "type": "STRING",
                    "description": "Date of appointment in YYYY-MM-DD format."
                },
                "time_slot": {
                    "type": "STRING",
                    "description": "Selected time slot, e.g. '10:00 AM' or '04:30 PM'."
                }
            },
            "required": ["patient_name", "mobile_number", "date", "time_slot"]
        }
    }
]
