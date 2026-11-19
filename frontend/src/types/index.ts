export interface Appointment {
  id: string;
  tenant_id: string;
  clinic_id: string;
  doctor_id?: string;
  patient_name: string;
  mobile_number: string;
  doctor_name: string;
  clinic_name: string;
  clinic_address: string;
  appointment_date: string;
  time_slot: string;
  appointment_datetime: string;
  status: 'CONFIRMED' | 'COMPLETED' | 'CANCELLED' | 'RESCHEDULED';
  reminder_sent: boolean;
  reminder_sent_at?: string;
  created_at: string;
}

export interface Doctor {
  id: string;
  clinic_id: string;
  name: string;
  specialty: string;
  available_days: string;
  morning_slots: string;
  evening_slots: string;
  slot_duration_minutes: number;
  is_active: boolean;
}

export interface Clinic {
  id: string;
  tenant_id: string;
  name: string;
  address: string;
  phone: string;
  timezone: string;
  consultation_hours: string;
}

export interface Patient {
  id: string;
  tenant_id: string;
  full_name: string;
  mobile_number: string;
  created_at: string;
}

export interface DashboardStats {
  total_appointments: number;
  today_appointments: number;
  confirmed_appointments: number;
  cancelled_appointments: number;
  total_patients: number;
  total_doctors: number;
  pending_reminders: number;
}

export interface ChatMessage {
  id: string;
  sender: 'user' | 'bot';
  text: string;
  timestamp: string;
  toolsExecuted?: string[];
}
