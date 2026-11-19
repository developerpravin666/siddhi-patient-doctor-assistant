import axios from 'axios';
import { Appointment, Doctor, Clinic, Patient, DashboardStats } from '../types';

const api = axios.create({
  baseURL: '',
  headers: {
    'Content-Type': 'application/json',
  },
});

export const getDashboardStats = async (): Promise<DashboardStats> => {
  const res = await api.get('/api/v1/admin/stats');
  return res.data;
};

export const getAppointments = async (params?: {
  date?: string;
  status?: string;
  search?: string;
}): Promise<Appointment[]> => {
  const res = await api.get('/api/v1/appointments', { params });
  return res.data;
};

export const getAvailableSlots = async (date: string): Promise<{ available_slots: string[]; date: string }> => {
  const res = await api.get('/api/v1/appointments/slots/available', { params: { date } });
  return res.data;
};

export const createAppointment = async (data: {
  patient_name: string;
  mobile_number: string;
  appointment_date: string;
  time_slot: string;
}): Promise<Appointment> => {
  const res = await api.post('/api/v1/appointments', data);
  return res.data;
};

export const updateAppointmentStatus = async (
  id: string,
  data: { status: string; new_date?: string; new_time_slot?: string }
): Promise<Appointment> => {
  const res = await api.patch(`/api/v1/appointments/${id}/status`, data);
  return res.data;
};

export const getDoctors = async (): Promise<Doctor[]> => {
  const res = await api.get('/api/v1/admin/doctors');
  return res.data;
};

export const getClinics = async (): Promise<Clinic[]> => {
  const res = await api.get('/api/v1/admin/clinics');
  return res.data;
};

export const getPatients = async (search?: string): Promise<Patient[]> => {
  const res = await api.get('/api/v1/admin/patients', { params: { search } });
  return res.data;
};

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
