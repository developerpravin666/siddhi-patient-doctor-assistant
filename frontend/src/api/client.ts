import axios from 'axios';
import { Appointment, Doctor, Clinic, Patient, DashboardStats, AdminUser, Tenant, WhatsAppConfig, Specialization } from '../types';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Attach Authorization Bearer token to all outgoing requests
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('siddhi_auth_token');
  if (token && config.headers) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Response interceptor to handle token expiry / 401 errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && error.response.status === 401) {
      // Don't clear on login attempt failures, only on protected resource failures
      if (!error.config.url?.includes('/auth/login')) {
        localStorage.removeItem('siddhi_auth_token');
        localStorage.removeItem('siddhi_user');
      }
    }
    return Promise.reject(error);
  }
);

// -----------------------------------------------------------------------------
// Auth API
// -----------------------------------------------------------------------------
export const loginApi = async (username: string, password: string): Promise<{ access_token: string; user: AdminUser }> => {
  const res = await api.post('/api/v1/auth/login', { username, password });
  localStorage.setItem('siddhi_auth_token', res.data.access_token);
  localStorage.setItem('siddhi_user', JSON.stringify(res.data.user));
  return res.data;
};

export const getMe = async (): Promise<AdminUser> => {
  const res = await api.get('/api/v1/auth/me');
  return res.data;
};

export const logoutApi = () => {
  localStorage.removeItem('siddhi_auth_token');
  localStorage.removeItem('siddhi_user');
};

export const getStoredUser = (): AdminUser | null => {
  const raw = localStorage.getItem('siddhi_user');
  if (raw) {
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }
  return null;
};

// -----------------------------------------------------------------------------
// Dashboard & Analytics
// -----------------------------------------------------------------------------
export const getDashboardStats = async (): Promise<DashboardStats> => {
  const res = await api.get('/api/v1/admin/stats');
  return res.data;
};

// -----------------------------------------------------------------------------
// Tenant Management (SUPER_ADMIN)
// -----------------------------------------------------------------------------
export const getTenants = async (): Promise<Tenant[]> => {
  const res = await api.get('/api/v1/admin/tenants');
  return res.data;
};

export const createTenant = async (data: {
  name: string;
  schema_name?: string;
  owner_name?: string;
  owner_phone?: string;
  owner_email?: string;
  admin_username?: string;
  admin_password?: string;
  status?: string;
}): Promise<Tenant> => {
  const res = await api.post('/api/v1/admin/tenants', data);
  return res.data;
};

export const updateTenant = async (
  id: string,
  data: {
    name?: string;
    owner_name?: string;
    owner_phone?: string;
    owner_email?: string;
    status?: string;
  }
): Promise<Tenant> => {
  const res = await api.put(`/api/v1/admin/tenants/${id}`, data);
  return res.data;
};

// -----------------------------------------------------------------------------
// User Management (SUPER_ADMIN & CLINIC_ADMIN)
// -----------------------------------------------------------------------------
export const getUsers = async (): Promise<AdminUser[]> => {
  const res = await api.get('/api/v1/admin/users');
  return res.data;
};

export const getUser = async (id: string): Promise<AdminUser> => {
  const res = await api.get(`/api/v1/admin/users/${id}`);
  return res.data;
};

export const createUser = async (data: {
  username: string;
  password: string;
  full_name: string;
  role: string;
  tenant_id?: string;
  clinic_id?: string;
  permissions?: any;
}): Promise<AdminUser> => {
  const res = await api.post('/api/v1/admin/users', data);
  return res.data;
};

export const updateUser = async (id: string, data: Partial<AdminUser> & { password?: string; permissions?: any }): Promise<AdminUser> => {
  const res = await api.put(`/api/v1/admin/users/${id}`, data);
  return res.data;
};

export const deleteUser = async (id: string): Promise<void> => {
  await api.delete(`/api/v1/admin/users/${id}`);
};

// -----------------------------------------------------------------------------
// Appointments
// -----------------------------------------------------------------------------
export const getAppointments = async (params?: {
  date?: string;
  status?: string;
  search?: string;
}): Promise<Appointment[]> => {
  const res = await api.get('/api/v1/appointments', { params });
  return res.data;
};

export const getAppointment = async (id: string): Promise<Appointment> => {
  const res = await api.get(`/api/v1/appointments/${id}`);
  return res.data;
};

export const getAvailableSlots = async (date: string, doctorId?: string): Promise<{ available_slots: string[]; date: string }> => {
  const params: Record<string, string> = { date };
  if (doctorId) params.doctor_id = doctorId;
  const res = await api.get('/api/v1/appointments/slots/available', { params });
  return res.data;
};

export const createAppointment = async (data: {
  patient_name: string;
  mobile_number: string;
  appointment_date: string;
  time_slot: string;
  clinic_id?: string;
  doctor_id?: string;
  notes?: string;
}): Promise<Appointment> => {
  const res = await api.post('/api/v1/appointments', data);
  return res.data;
};

export const updateAppointment = async (
  id: string,
  data: {
    patient_name?: string;
    mobile_number?: string;
    appointment_date?: string;
    time_slot?: string;
    doctor_id?: string;
    clinic_id?: string;
    status?: string;
    notes?: string;
  }
): Promise<Appointment> => {
  const res = await api.put(`/api/v1/appointments/${id}`, data);
  return res.data;
};

export const updateAppointmentStatus = async (
  id: string,
  data: { status: string; new_date?: string; new_time_slot?: string }
): Promise<Appointment> => {
  const res = await api.patch(`/api/v1/appointments/${id}/status`, data);
  return res.data;
};

// -----------------------------------------------------------------------------
// Doctors Management
// -----------------------------------------------------------------------------
export const getDoctors = async (): Promise<Doctor[]> => {
  const res = await api.get('/api/v1/admin/doctors');
  return res.data;
};

export const getDoctor = async (id: string): Promise<Doctor> => {
  const res = await api.get(`/api/v1/admin/doctors/${id}`);
  return res.data;
};

export const createDoctor = async (data: {
  clinic_id?: string;
  name: string;
  specialty?: string;
  specialties?: string[];
  available_days?: string;
  morning_slots?: string;
  evening_slots?: string;
  slot_duration_minutes?: number;
  is_active?: boolean;
}): Promise<Doctor> => {
  const res = await api.post('/api/v1/admin/doctors', data);
  return res.data;
};

export const updateDoctor = async (
  id: string,
  data: Partial<Doctor> & { specialties?: string[] }
): Promise<Doctor> => {
  const res = await api.put(`/api/v1/admin/doctors/${id}`, data);
  return res.data;
};

export const deleteDoctor = async (id: string): Promise<void> => {
  await api.delete(`/api/v1/admin/doctors/${id}`);
};

export const toggleDoctorStatus = async (id: string, is_active: boolean): Promise<Doctor> => {
  const res = await api.patch(`/api/v1/admin/doctors/${id}/status`, { is_active });
  return res.data;
};

// -----------------------------------------------------------------------------
// Clinics Management
// -----------------------------------------------------------------------------
export const getClinics = async (): Promise<Clinic[]> => {
  const res = await api.get('/api/v1/admin/clinics');
  return res.data;
};

export const updateClinic = async (id: string, data: Partial<Clinic>): Promise<Clinic> => {
  const res = await api.put(`/api/v1/admin/clinics/${id}`, data);
  return res.data;
};

// -----------------------------------------------------------------------------
// Patients Directory (Full CRUD & Status Toggle)
// -----------------------------------------------------------------------------
export const getPatients = async (params?: { search?: string; status_filter?: string }): Promise<Patient[]> => {
  const res = await api.get('/api/v1/admin/patients', { params });
  return res.data;
};

export const getPatient = async (id: string): Promise<Patient> => {
  const res = await api.get(`/api/v1/admin/patients/${id}`);
  return res.data;
};

export const createPatient = async (data: Partial<Patient>): Promise<Patient> => {
  const res = await api.post('/api/v1/admin/patients', data);
  return res.data;
};

export const updatePatient = async (id: string, data: Partial<Patient>): Promise<Patient> => {
  const res = await api.put(`/api/v1/admin/patients/${id}`, data);
  return res.data;
};

export const togglePatientStatus = async (id: string, is_active: boolean): Promise<Patient> => {
  const res = await api.patch(`/api/v1/admin/patients/${id}/status`, { is_active });
  return res.data;
};

export const deletePatient = async (id: string): Promise<void> => {
  await api.delete(`/api/v1/admin/patients/${id}`);
};

// -----------------------------------------------------------------------------
// Specializations Master Catalog
// -----------------------------------------------------------------------------
export const getSpecializations = async (params?: { search?: string; is_active?: boolean }): Promise<Specialization[]> => {
  const res = await api.get('/api/v1/admin/specializations', { params });
  return res.data;
};

export const getSpecialization = async (id: string): Promise<Specialization> => {
  const res = await api.get(`/api/v1/admin/specializations/${id}`);
  return res.data;
};

export const createSpecialization = async (data: {
  name: string;
  description?: string;
  is_active?: boolean;
}): Promise<Specialization> => {
  const res = await api.post('/api/v1/admin/specializations', data);
  return res.data;
};

export const updateSpecialization = async (
  id: string,
  data: { name?: string; description?: string; is_active?: boolean }
): Promise<Specialization> => {
  const res = await api.put(`/api/v1/admin/specializations/${id}`, data);
  return res.data;
};

export const toggleSpecializationStatus = async (id: string, is_active: boolean): Promise<Specialization> => {
  const res = await api.patch(`/api/v1/admin/specializations/${id}/status`, { is_active });
  return res.data;
};

export const deleteSpecialization = async (id: string): Promise<void> => {
  await api.delete(`/api/v1/admin/specializations/${id}`);
};

// -----------------------------------------------------------------------------
// WhatsApp API Configuration & Bot Settings
// -----------------------------------------------------------------------------
export const getWhatsAppConfig = async (): Promise<WhatsAppConfig> => {
  const res = await api.get('/api/v1/admin/whatsapp/config');
  return res.data;
};

export const updateWhatsAppConfig = async (data: Partial<WhatsAppConfig>): Promise<WhatsAppConfig> => {
  const res = await api.post('/api/v1/admin/whatsapp/config', data);
  return res.data;
};

export const testWhatsAppConnection = async (testMobileNumber: string): Promise<{ status: string; message: string }> => {
  const res = await api.post('/api/v1/admin/whatsapp/test', { test_mobile_number: testMobileNumber });
  return res.data;
};

// -----------------------------------------------------------------------------
// WhatsApp Simulator
// -----------------------------------------------------------------------------
export const simulateWhatsAppMessage = async (data: {
  phone_number: string;
  message_text: string;
}): Promise<{ reply_text: string; session_state: any; tools_executed: string[] }> => {
  const res = await api.post('/webhook/simulate', data);
  return res.data;
};

export const resetWhatsAppSession = async (phoneNumber: string): Promise<void> => {
  await api.post('/webhook/reset-session', { phone_number: phoneNumber, message_text: '' });
};

export default api;
