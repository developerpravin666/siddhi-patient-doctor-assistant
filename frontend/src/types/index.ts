export type UserRole = 'SUPER_ADMIN' | 'CLINIC_ADMIN' | 'RECEPTIONIST';

export interface ActionPermissions {
  view: boolean;
  create: boolean;
  edit: boolean;
  delete: boolean;
}

export type ScreenPermissions = Record<string, ActionPermissions>;

export interface AdminUser {
  id: string;
  username: string;
  full_name: string;
  role: UserRole;
  tenant_id?: string;
  clinic_id?: string;
  permissions?: ScreenPermissions;
  is_active: boolean;
  created_at: string;
}

export interface Tenant {
  id: string;
  name: string;
  schema_name: string;
  owner_name?: string;
  owner_phone?: string;
  owner_email?: string;
  admin_username?: string;
  status: 'ACTIVE' | 'SUSPENDED';
  created_at: string;
  updated_at: string;
}

export interface Appointment {
  id: string;
  tenant_id?: string;
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
  morning_slots?: string | null;
  evening_slots?: string | null;
  slot_duration_minutes: number;
  is_active: boolean;
}

export interface Clinic {
  id: string;
  tenant_id?: string;
  name: string;
  address: string;
  phone?: string | null;
  timezone: string;
  consultation_hours?: string | null;
  whatsapp_phone_number_id?: string | null;
  whatsapp_business_account_id?: string | null;
  whatsapp_access_token?: string | null;
  whatsapp_verify_token?: string | null;
  bot_config?: {
    enable_doctor_selection?: boolean;
    default_doctor_id?: string | null;
    welcome_message?: string;
    reminder_lead_time_minutes?: number;
    enable_ai_bot?: boolean;
  } | null;
}

export interface Patient {
  id: string;
  tenant_id?: string;
  full_name: string;
  mobile_number: string;
  email?: string | null;
  gender?: string | null;
  age?: number | null;
  address?: string | null;
  status?: 'ACTIVE' | 'INACTIVE';
  is_active?: boolean;
  created_at: string;
  updated_at?: string;
}

export interface Specialization {
  id: string;
  name: string;
  description?: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface WhatsAppConfig {
  clinic_id: string;
  clinic_name: string;
  whatsapp_phone_number_id?: string | null;
  whatsapp_business_account_id?: string | null;
  whatsapp_access_token?: string | null;
  whatsapp_verify_token?: string | null;
  bot_config?: {
    enable_doctor_selection?: boolean;
    default_doctor_id?: string | null;
    welcome_message?: string;
    reminder_lead_time_minutes?: number;
    enable_ai_bot?: boolean;
  } | null;
  is_live: boolean;
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

export interface WebhookEvent {
  id: string;
  event_type: string;
  sender_phone?: string | null;
  recipient_phone_id?: string | null;
  message_id?: string | null;
  message_body?: string | null;
  status: string;
  error_message?: string | null;
  raw_payload?: Record<string, any> | null;
  headers?: Record<string, any> | null;
  created_at: string;
}

export interface AppContextType {
  currentUser: AdminUser | null;
  userRole: UserRole;
  stats?: DashboardStats;
  appointments?: Appointment[];
  doctors?: Doctor[];
  clinics?: Clinic[];
  patients?: Patient[];
  loadData?: () => Promise<void>;
  handleLogout: () => void;
}
