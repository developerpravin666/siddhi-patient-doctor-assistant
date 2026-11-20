import React, { useState, useEffect } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { 
  Calendar, 
  ArrowLeft, 
  User, 
  Phone, 
  Stethoscope, 
  Clock, 
  CheckCircle, 
  AlertCircle, 
  Save,
  FileText
} from 'lucide-react';
import { z } from 'zod';
import { 
  getDoctors, 
  getAvailableSlots, 
  createAppointment, 
  updateAppointment, 
  getAppointment,
  getPatients
} from '../api/client';
import { Doctor, Patient } from '../types';
import { SearchableSelect } from '../components/SearchableSelect';

const appointmentSchema = z.object({
  patient_name: z.string().trim().min(2, 'Patient name must be at least 2 characters').max(120, 'Name cannot exceed 120 characters'),
  mobile_number: z.string().trim()
    .min(10, 'Mobile number must be at least 10 digits')
    .max(15, 'Mobile number cannot exceed 15 digits')
    .regex(/^[0-9+\s-]+$/, 'Mobile number can only contain digits, spaces, and hyphens'),
  appointment_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Please choose a valid appointment date (YYYY-MM-DD)'),
  doctor_id: z.string().min(1, 'Please select a doctor'),
  time_slot: z.string().min(1, 'Please select an available time slot'),
  status: z.enum(['CONFIRMED', 'COMPLETED', 'CANCELLED', 'RESCHEDULED']).default('CONFIRMED'),
  notes: z.string().optional(),
});

type AppointmentFormData = z.infer<typeof appointmentSchema>;

export const AppointmentForm: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const isEditMode = Boolean(id);
  const navigate = useNavigate();

  // Data states
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [availableSlots, setAvailableSlots] = useState<string[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [loadingInitial, setLoadingInitial] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  // Default target date: tomorrow
  const tomorrowStr = new Date(Date.now() + 86400000).toISOString().split('T')[0];

  // Form states
  const [formData, setFormData] = useState<AppointmentFormData>({
    patient_name: '',
    mobile_number: '',
    appointment_date: tomorrowStr,
    doctor_id: '',
    time_slot: '',
    status: 'CONFIRMED',
    notes: '',
  });

  // Load initial doctors & patients & existing appointment if edit mode
  useEffect(() => {
    const initData = async () => {
      try {
        setLoadingInitial(true);
        const [docs, pts] = await Promise.all([
          getDoctors(),
          getPatients({ status_filter: 'ACTIVE' }),
        ]);
        setDoctors(docs);
        setPatients(pts);

        if (isEditMode && id) {
          const appt = await getAppointment(id);
          setFormData({
            patient_name: appt.patient_name,
            mobile_number: appt.mobile_number,
            appointment_date: appt.appointment_date,
            doctor_id: appt.doctor_id || (docs.length > 0 ? docs[0].id : ''),
            time_slot: appt.time_slot,
            status: appt.status,
            notes: '',
          });
        } else if (docs.length > 0) {
          // Select first active doctor by default
          setFormData((prev) => ({
            ...prev,
            doctor_id: docs.find((d) => d.is_active)?.id || docs[0].id,
          }));
        }
      } catch (err: any) {
        setErrorMessage(err.response?.data?.detail || 'Failed to load initial data.');
      } finally {
        setLoadingInitial(false);
      }
    };
    initData();
  }, [id, isEditMode]);

  // Whenever doctor_id or appointment_date changes, load available slots!
  useEffect(() => {
    if (!formData.appointment_date) return;

    const fetchSlots = async () => {
      try {
        setLoadingSlots(true);
        const res = await getAvailableSlots(formData.appointment_date, formData.doctor_id || undefined);
        let slots = res.available_slots || [];

        // If editing and the currently selected slot isn't in open list, keep it visible
        if (formData.time_slot && !slots.includes(formData.time_slot)) {
          slots = [formData.time_slot, ...slots];
        }

        setAvailableSlots(slots);
      } catch (err) {
        console.warn('Failed to load slots:', err);
      } finally {
        setLoadingSlots(false);
      }
    };

    fetchSlots();
  }, [formData.appointment_date, formData.doctor_id]);

  // When patient is selected from existing patient directory
  const handleSelectExistingPatient = (patientId: string) => {
    const pt = patients.find((p) => p.id === patientId);
    if (pt) {
      setFormData((prev) => ({
        ...prev,
        patient_name: pt.full_name,
        mobile_number: pt.mobile_number,
      }));
      setFormErrors((prev) => ({
        ...prev,
        patient_name: '',
        mobile_number: '',
      }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormErrors({});
    setErrorMessage('');

    const validation = appointmentSchema.safeParse(formData);
    if (!validation.success) {
      const fieldErrors: Record<string, string> = {};
      validation.error.issues.forEach((issue) => {
        if (issue.path[0]) {
          fieldErrors[issue.path[0].toString()] = issue.message;
        }
      });
      setFormErrors(fieldErrors);
      return;
    }

    try {
      setSaving(true);
      if (isEditMode && id) {
        await updateAppointment(id, {
          patient_name: formData.patient_name.trim(),
          mobile_number: formData.mobile_number.trim(),
          appointment_date: formData.appointment_date,
          time_slot: formData.time_slot,
          doctor_id: formData.doctor_id,
          status: formData.status,
          notes: formData.notes,
        });
      } else {
        await createAppointment({
          patient_name: formData.patient_name.trim(),
          mobile_number: formData.mobile_number.trim(),
          appointment_date: formData.appointment_date,
          time_slot: formData.time_slot,
          doctor_id: formData.doctor_id,
          notes: formData.notes,
        });
      }

      navigate('/appointments');
    } catch (err: any) {
      setErrorMessage(err.response?.data?.detail || 'Failed to save appointment. Please check inputs.');
    } finally {
      setSaving(false);
    }
  };

  // Group available slots into Morning and Afternoon/Evening
  const morningSlots = availableSlots.filter((s) => s.includes('AM'));
  const eveningSlots = availableSlots.filter((s) => s.includes('PM'));

  const selectedDoctor = doctors.find((d) => d.id === formData.doctor_id);

  if (loadingInitial) {
    return (
      <div className="p-12 text-center text-slate-500">
        <Calendar className="w-8 h-8 animate-spin mx-auto mb-2 text-indigo-600" />
        <p>Loading appointment booking form...</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Top Header */}
      <div className="flex items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div className="flex items-center gap-3">
          <Link
            to="/appointments"
            className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition"
            title="Back to Appointments"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <span className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
                <Calendar className="w-5 h-5" />
              </span>
              <h1 className="text-2xl font-bold text-slate-900">
                {isEditMode ? 'Update Patient Appointment' : 'Book New Patient Appointment'}
              </h1>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Select doctor, choose consultation date, and reserve an available appointment slot.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => navigate('/appointments')}
          className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800 border border-slate-200 rounded-xl hover:bg-slate-50 transition"
        >
          Cancel
        </button>
      </div>

      {/* Error Alert */}
      {errorMessage && (
        <div className="p-4 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-sm flex items-center gap-2.5">
          <AlertCircle className="w-5 h-5 text-rose-600 flex-shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Booking Form */}
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Step 1: Patient Information */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3 border-b border-slate-100">
            <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
              <User className="w-4 h-4 text-indigo-600" />
              Patient Contact Information
            </h2>

            {/* Quick Existing Patient Picker */}
            {patients.length > 0 && !isEditMode && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500 font-medium shrink-0">Or pick existing:</span>
                <div className="w-64">
                  <SearchableSelect
                    size="sm"
                    placeholder="-- Choose Patient --"
                    searchPlaceholder="Search name or mobile..."
                    value=""
                    onChange={(val) => {
                      if (val) handleSelectExistingPatient(val);
                    }}
                    options={patients.map((p) => ({
                      value: p.id,
                      label: p.full_name,
                      subLabel: p.mobile_number,
                    }))}
                  />
                </div>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Patient Full Name <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="e.g. Ramesh Patel"
                  value={formData.patient_name}
                  onChange={(e) => setFormData({ ...formData, patient_name: e.target.value })}
                  className={`w-full pl-10 pr-4 py-2.5 rounded-xl border ${
                    formErrors.patient_name ? 'border-rose-400 bg-rose-50' : 'border-slate-300'
                  } text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500`}
                />
              </div>
              {formErrors.patient_name && (
                <p className="text-xs text-rose-600 mt-1 font-medium">{formErrors.patient_name}</p>
              )}
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Mobile Number <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <Phone className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="e.g. 9876543210"
                  value={formData.mobile_number}
                  onChange={(e) => setFormData({ ...formData, mobile_number: e.target.value })}
                  className={`w-full pl-10 pr-4 py-2.5 rounded-xl border ${
                    formErrors.mobile_number ? 'border-rose-400 bg-rose-50' : 'border-slate-300'
                  } text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500`}
                />
              </div>
              {formErrors.mobile_number && (
                <p className="text-xs text-rose-600 mt-1 font-medium">{formErrors.mobile_number}</p>
              )}
              <p className="text-[11px] text-slate-400 mt-1">
                Used for automated WhatsApp appointment reminders and status updates.
              </p>
            </div>
          </div>
        </div>

        {/* Step 2: Doctor & Date Selection */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-5">
          <h2 className="text-base font-bold text-slate-800 flex items-center gap-2 pb-3 border-b border-slate-100">
            <Stethoscope className="w-4 h-4 text-indigo-600" />
            Doctor & Appointment Date
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Consulting Doctor <span className="text-rose-500">*</span>
              </label>
              <SearchableSelect
                placeholder="-- Choose Doctor --"
                searchPlaceholder="Search doctor or specialty..."
                value={formData.doctor_id}
                error={formErrors.doctor_id}
                onChange={(val) => setFormData({ ...formData, doctor_id: val, time_slot: '' })}
                options={doctors.map((doc) => ({
                  value: doc.id,
                  label: doc.name,
                  subLabel: `${doc.specialty} (${doc.slot_duration_minutes || 15} min interval)`,
                }))}
              />
              {selectedDoctor && (
                <div className="mt-2 p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-600 flex items-center justify-between">
                  <span>
                    <strong>Specialization:</strong> {selectedDoctor.specialty}
                  </span>
                  <span>
                    <strong>Working Days:</strong> {selectedDoctor.available_days}
                  </span>
                </div>
              )}
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Appointment Date <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <Calendar className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="date"
                  value={formData.appointment_date}
                  onChange={(e) => setFormData({ ...formData, appointment_date: e.target.value, time_slot: '' })}
                  className={`w-full pl-10 pr-4 py-2.5 rounded-xl border ${
                    formErrors.appointment_date ? 'border-rose-400 bg-rose-50' : 'border-slate-300'
                  } text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500`}
                />
              </div>
              {formErrors.appointment_date && (
                <p className="text-xs text-rose-600 mt-1 font-medium">{formErrors.appointment_date}</p>
              )}
              <div className="flex items-center gap-2 mt-2">
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, appointment_date: new Date().toISOString().split('T')[0], time_slot: '' })}
                  className="px-2.5 py-1 text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition"
                >
                  Today
                </button>
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, appointment_date: tomorrowStr, time_slot: '' })}
                  className="px-2.5 py-1 text-xs font-semibold bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg transition"
                >
                  Tomorrow
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Step 3: Dynamic Available Slots Selector */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div>
              <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
                <Clock className="w-4 h-4 text-indigo-600" />
                Select Available Consultation Time Slot <span className="text-rose-500">*</span>
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Slots dynamically generated based on doctor interval ({selectedDoctor?.slot_duration_minutes || 15} mins) and existing booked appointments.
              </p>
            </div>
            {formData.time_slot && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-indigo-100 text-indigo-800 rounded-full text-xs font-bold">
                <CheckCircle className="w-3.5 h-3.5 text-indigo-600" />
                Selected: {formData.time_slot}
              </span>
            )}
          </div>

          {formErrors.time_slot && (
            <p className="text-xs text-rose-600 font-semibold">{formErrors.time_slot}</p>
          )}

          {loadingSlots ? (
            <div className="p-8 text-center text-slate-400 text-sm">
              <Clock className="w-6 h-6 animate-spin mx-auto mb-2 text-indigo-500" />
              Querying live slot availability for {formData.appointment_date}...
            </div>
          ) : availableSlots.length === 0 ? (
            <div className="p-8 text-center text-slate-500 bg-slate-50 rounded-xl border border-slate-200">
              <AlertCircle className="w-8 h-8 text-amber-500 mx-auto mb-2" />
              <p className="font-semibold text-slate-800">No open consultation slots available</p>
              <p className="text-xs text-slate-500 mt-1">
                All slots are booked or doctor is not on duty for {formData.appointment_date}. Please choose another date or doctor.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Morning Slots */}
              {morningSlots.length > 0 && (
                <div>
                  <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-amber-400"></span>
                    Morning Consultation Hours ({morningSlots.length} Open Slots)
                  </h3>
                  <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-2">
                    {morningSlots.map((slot) => {
                      const isSelected = formData.time_slot === slot;
                      return (
                        <button
                          key={slot}
                          type="button"
                          onClick={() => {
                            setFormData({ ...formData, time_slot: slot });
                            setFormErrors((prev) => ({ ...prev, time_slot: '' }));
                          }}
                          className={`px-3 py-2.5 rounded-xl text-xs font-semibold transition border text-center ${
                            isSelected
                              ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm ring-2 ring-indigo-200'
                              : 'bg-white hover:bg-indigo-50/60 text-slate-700 border-slate-200 hover:border-indigo-300'
                          }`}
                        >
                          {slot}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Afternoon / Evening Slots */}
              {eveningSlots.length > 0 && (
                <div>
                  <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-indigo-500"></span>
                    Evening Consultation Hours ({eveningSlots.length} Open Slots)
                  </h3>
                  <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-2">
                    {eveningSlots.map((slot) => {
                      const isSelected = formData.time_slot === slot;
                      return (
                        <button
                          key={slot}
                          type="button"
                          onClick={() => {
                            setFormData({ ...formData, time_slot: slot });
                            setFormErrors((prev) => ({ ...prev, time_slot: '' }));
                          }}
                          className={`px-3 py-2.5 rounded-xl text-xs font-semibold transition border text-center ${
                            isSelected
                              ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm ring-2 ring-indigo-200'
                              : 'bg-white hover:bg-indigo-50/60 text-slate-700 border-slate-200 hover:border-indigo-300'
                          }`}
                        >
                          {slot}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Step 4: Status (for Edit) & Notes */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
          <h2 className="text-base font-bold text-slate-800 flex items-center gap-2 pb-3 border-b border-slate-100">
            <FileText className="w-4 h-4 text-indigo-600" />
            Additional Details & Status
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {isEditMode && (
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Appointment Status
                </label>
                <SearchableSelect
                  value={formData.status}
                  onChange={(val) => setFormData({ ...formData, status: val as any })}
                  searchable={false}
                  options={[
                    { value: 'CONFIRMED', label: 'CONFIRMED (Scheduled)' },
                    { value: 'COMPLETED', label: 'COMPLETED (Consultation Done)' },
                    { value: 'RESCHEDULED', label: 'RESCHEDULED' },
                    { value: 'CANCELLED', label: 'CANCELLED' },
                  ]}
                />
              </div>
            )}

            <div className={isEditMode ? '' : 'md:col-span-2'}>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Consultation Reason / Clinical Notes <span className="text-slate-400 text-xs font-normal">(Optional)</span>
              </label>
              <textarea
                rows={2}
                placeholder="e.g. Routine blood pressure checkup, dental cleaning, or symptoms description..."
                value={formData.notes || ''}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>
        </div>

        {/* Form Actions */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={() => navigate('/appointments')}
            className="px-5 py-2.5 border border-slate-300 text-slate-700 rounded-xl text-sm font-semibold hover:bg-slate-50 transition"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving || !formData.time_slot}
            className="inline-flex items-center gap-2 px-6 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 transition shadow-sm hover:shadow disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            {saving ? 'Saving...' : isEditMode ? 'Update Appointment' : 'Confirm Booking'}
          </button>
        </div>
      </form>
    </div>
  );
};
