import axios from 'axios';
import { Appointment, Doctor, Clinic, Patient, DashboardStats, AdminUser, Tenant, WhatsAppConfig, Specialization, WebhookEvent } from '../types';
import { API_BASE_URL, getApiBaseUrl } from '../config';

export { API_BASE_URL, getApiBaseUrl };

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Attach Authorization Bearer token, active tenant override (for Super Admin context switching), and dynamic base URL
api.interceptors.request.use((config) => {
  const currentBase = getApiBaseUrl();
  if (currentBase) {
    config.baseURL = currentBase;
  }
  const token = localStorage.getItem('siddhi_auth_token');
  if (token && config.headers) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  // If Super Admin has selected a specific tenant clinic context, attach impersonation headers
  const activeTenantId = localStorage.getItem('siddhi_active_tenant_id');
  const activeTenantSchema = localStorage.getItem('siddhi_active_tenant_schema');
  if (activeTenantId && config.headers) {
    config.headers['X-Tenant-ID'] = activeTenantId;
  }
  if (activeTenantSchema && config.headers) {
    config.headers['X-Tenant-Schema'] = activeTenantSchema;
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

export const updateMyProfileApi = async (data: { full_name?: string; password?: string }): Promise<AdminUser> => {
  const res = await api.put('/api/v1/auth/profile', data);
  if (res.data) {
    const existing = getStoredUser();
    if (existing) {
      const updated = { ...existing, full_name: res.data.full_name };
      localStorage.setItem('siddhi_user', JSON.stringify(updated));
    }
  }
  return res.data;
};

export const logoutApi = () => {
  localStorage.removeItem('siddhi_auth_token');
  localStorage.removeItem('siddhi_user');
  localStorage.removeItem('siddhi_active_tenant_id');
  localStorage.removeItem('siddhi_active_tenant_schema');
  localStorage.removeItem('siddhi_active_tenant_name');
};

export const forgotPasswordApi = async (username: string): Promise<{ status: string; message: string; reset_token?: string }> => {
  const res = await api.post('/api/v1/auth/forgot-password', { username });
  return res.data;
};

export const resetPasswordApi = async (token: string, new_password: string): Promise<{ status: string; message: string }> => {
  const res = await api.post('/api/v1/auth/reset-password', { token, new_password });
  return res.data;
};

export const changePasswordApi = async (current_password: string, new_password: string): Promise<{ status: string; message: string }> => {
  const res = await api.post('/api/v1/auth/change-password', { current_password, new_password });
  return res.data;
};

export const getActiveTenantId = (): string | null => {
  return localStorage.getItem('siddhi_active_tenant_id');
};

export const getActiveTenantSchema = (): string | null => {
  return localStorage.getItem('siddhi_active_tenant_schema');
};

export const getActiveTenantName = (): string | null => {
  return localStorage.getItem('siddhi_active_tenant_name');
};

export const setActiveTenant = (tenant: Tenant | null) => {
  if (tenant) {
    localStorage.setItem('siddhi_active_tenant_id', tenant.id);
    localStorage.setItem('siddhi_active_tenant_schema', tenant.schema_name);
    localStorage.setItem('siddhi_active_tenant_name', tenant.clinic_name || tenant.name);
  } else {
    localStorage.removeItem('siddhi_active_tenant_id');
    localStorage.removeItem('siddhi_active_tenant_schema');
    localStorage.removeItem('siddhi_active_tenant_name');
  }
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

// Helper to wrap paginated response and attach server total from X-Total-Count header
export interface PaginatedList<T> extends Array<T> {
  total?: number;
}

const wrapPaginatedResponse = <T>(res: any): PaginatedList<T> => {
  const data = res.data;
  const headerTotal = res.headers?.['x-total-count'] || res.headers?.['X-Total-Count'];
  const total = headerTotal !== undefined ? parseInt(headerTotal, 10) : (Array.isArray(data) ? data.length : 0);
  if (Array.isArray(data)) {
    (data as any).total = isNaN(total) ? data.length : total;
  }
  return data;
};

// -----------------------------------------------------------------------------
// Tenant Management (SUPER_ADMIN)
// -----------------------------------------------------------------------------
export const getTenants = async (params?: {
  search?: string;
  status_filter?: string;
  sort_by?: string;
  sort_dir?: string;
  page?: number;
  page_size?: number;
}): Promise<PaginatedList<Tenant>> => {
  const res = await api.get('/api/v1/admin/tenants', { params });
  return wrapPaginatedResponse<Tenant>(res);
};

export const getTenant = async (id: string): Promise<Tenant> => {
  const res = await api.get(`/api/v1/admin/tenants/${id}`);
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
export const getUsers = async (params?: {
  search?: string;
  role?: string;
  tenant_id?: string;
  sort_by?: string;
  sort_dir?: string;
  page?: number;
  page_size?: number;
}): Promise<PaginatedList<AdminUser>> => {
  const res = await api.get('/api/v1/admin/users', { params });
  return wrapPaginatedResponse<AdminUser>(res);
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
  from_date?: string;
  to_date?: string;
  status?: string;
  search?: string;
  doctor_id?: string;
  sort_by?: string;
  sort_dir?: string;
  page?: number;
  page_size?: number;
}): Promise<PaginatedList<Appointment>> => {
  const res = await api.get('/api/v1/appointments', { params });
  return wrapPaginatedResponse<Appointment>(res);
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
export const getDoctors = async (params?: {
  search?: string;
  specialty?: string;
  is_active?: boolean;
  clinic_id?: string;
  sort_by?: string;
  sort_dir?: string;
  page?: number;
  page_size?: number;
}): Promise<PaginatedList<Doctor>> => {
  const res = await api.get('/api/v1/admin/doctors', { params });
  return wrapPaginatedResponse<Doctor>(res);
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
export const getPatients = async (params?: {
  search?: string;
  status_filter?: string;
  sort_by?: string;
  sort_dir?: string;
  page?: number;
  page_size?: number;
}): Promise<PaginatedList<Patient>> => {
  const res = await api.get('/api/v1/admin/patients', { params });
  return wrapPaginatedResponse<Patient>(res);
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
export const getSpecializations = async (params?: {
  search?: string;
  is_active?: boolean;
  sort_by?: string;
  sort_dir?: string;
  page?: number;
  page_size?: number;
}): Promise<PaginatedList<Specialization>> => {
  const res = await api.get('/api/v1/admin/specializations', { params });
  return wrapPaginatedResponse<Specialization>(res);
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

export const testWhatsAppConnection = async (
  testMobileNumber: string,
  useTemplate: boolean = false
): Promise<{ status: string; message: string; is_live?: boolean }> => {
  const res = await api.post('/api/v1/admin/whatsapp/test', {
    test_mobile_number: testMobileNumber,
    use_template: useTemplate
  });
  return res.data;
};

export const subscribeWabaWebhook = async (): Promise<{ success: boolean; error?: string; data?: any }> => {
  const res = await api.post('/api/v1/admin/whatsapp/subscribe-waba');
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

// -----------------------------------------------------------------------------
// Webhook Events API (SUPER_ADMIN Only)
// -----------------------------------------------------------------------------
export const getWebhookEvents = async (params?: {
  search?: string;
  status?: string;
  event_type?: string;
  sort_by?: string;
  sort_dir?: 'asc' | 'desc';
  page?: number;
  page_size?: number;
}): Promise<{ events: WebhookEvent[]; total: number }> => {
  const res = await api.get('/api/v1/admin/webhook-events', { params });
  const rawTotal = res.headers['x-total-count'] || res.headers['X-Total-Count'];
  const total = rawTotal !== undefined && rawTotal !== null ? parseInt(rawTotal, 10) : res.data.length;
  return {
    events: res.data,
    total: isNaN(total) ? res.data.length : total,
  };
};

export const getWebhookEvent = async (id: string): Promise<WebhookEvent> => {
  const res = await api.get(`/api/v1/admin/webhook-events/${id}`);
  return res.data;
};

export const deleteWebhookEvent = async (id: string): Promise<void> => {
  await api.delete(`/api/v1/admin/webhook-events/${id}`);
};

export const purgeWebhookEvents = async (): Promise<void> => {
  await api.delete('/api/v1/admin/webhook-events');
};

export default api;
