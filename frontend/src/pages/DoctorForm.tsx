import React, { useState, useEffect } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import {
  Stethoscope,
  ArrowLeft,
  User,
  Clock,
  AlertCircle,
  Save,
  Plus,
  X,
  Layers,
  Zap,
  Info
} from 'lucide-react';
import { z } from 'zod';
import {
  getDoctor,
  createDoctor,
  updateDoctor,
  getSpecializations,
  getClinics
} from '../api/client';
import { Specialization } from '../types';
import { SearchableSelect } from '../components/SearchableSelect';
import { clearOrValidateField } from '../utils/validation';

const doctorSchema = z.object({
  name: z.string().trim().min(2, 'Doctor name must be at least 2 characters').max(100, 'Name cannot exceed 100 characters'),
  specialties: z.array(z.string()).min(1, 'Please select at least one specialization'),
  available_days: z.string().trim().min(3, 'Please select at least one working day'),
  slot_duration_minutes: z.number().min(5, 'Slot duration must be at least 5 minutes').max(120, 'Max duration is 120 minutes'),
  morning_slots: z.string().optional(),
  evening_slots: z.string().optional(),
  is_active: z.boolean().default(true),
});

type DoctorFormData = z.infer<typeof doctorSchema>;

const DAYS_OF_WEEK = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const INTERVAL_OPTIONS = [
  { value: 5, label: '5 minutes (Express Consult)' },
  { value: 10, label: '10 minutes (Quick Follow-up)' },
  { value: 15, label: '15 minutes (Standard Outpatient)' },
  { value: 20, label: '20 minutes (Moderate Consult)' },
  { value: 30, label: '30 minutes (Comprehensive Exam)' },
  { value: 45, label: '45 minutes (Specialized Assessment)' },
  { value: 60, label: '60 minutes (In-depth Procedure)' },
];

// Helper to generate formatted time slots based on interval
function generateSlots(startHour: number, startMin: number, endHour: number, endMin: number, intervalMins: number): string[] {
  const slots: string[] = [];
  let curr = new Date(2000, 0, 1, startHour, startMin);
  const end = new Date(2000, 0, 1, endHour, endMin);

  while (curr < end) {
    const hours = curr.getHours();
    const minutes = curr.getMinutes();
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const displayHour = hours % 12 === 0 ? 12 : hours % 12;
    const displayMinute = minutes < 10 ? `0${minutes}` : minutes;
    slots.push(`${displayHour < 10 ? '0' : ''}${displayHour}:${displayMinute} ${ampm}`);

    curr = new Date(curr.getTime() + intervalMins * 60000);
  }
  return slots;
}

// Parse "09:30 AM" or "04:15 PM" into total minutes from midnight
function parseSlotMinutes(slotStr: string): number | null {
  const match = slotStr.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!match) return null;
  let h = parseInt(match[1], 10);
  const m = parseInt(match[2], 10);
  const mer = match[3].toUpperCase();
  if (mer === 'AM' && h === 12) h = 0;
  if (mer === 'PM' && h !== 12) h += 12;
  return h * 60 + m;
}

function minsToHHMM(totalMins: number): string {
  const clamped = Math.max(0, Math.min(23 * 60 + 59, totalMins));
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function inferRangeFromSlots(slotsCsv: string | null | undefined, intervalMins: number, fallbackFrom: string, fallbackTo: string): { from: string; to: string } {
  if (!slotsCsv || !slotsCsv.trim()) {
    return { from: '', to: '' };
  }
  const parts = slotsCsv.split(',').map((s) => s.trim()).filter(Boolean);
  if (parts.length === 0) return { from: fallbackFrom, to: fallbackTo };
  const firstMins = parseSlotMinutes(parts[0]);
  const lastMins = parseSlotMinutes(parts[parts.length - 1]);
  if (firstMins === null || lastMins === null) {
    return { from: fallbackFrom, to: fallbackTo };
  }
  return {
    from: minsToHHMM(firstMins),
    to: minsToHHMM(lastMins + (intervalMins || 15)),
  };
}

function generateSlotsFromRange(fromTime: string, toTime: string, intervalMins: number): string {
  if (!fromTime || !toTime) return '';
  const [fh, fm] = fromTime.split(':').map(Number);
  const [th, tm] = toTime.split(':').map(Number);
  if (isNaN(fh) || isNaN(fm) || isNaN(th) || isNaN(tm)) return '';
  if (fh * 60 + fm >= th * 60 + tm) return '';
  return generateSlots(fh, fm, th, tm, intervalMins).join(', ');
}

export const DoctorForm: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const isEditMode = Boolean(id);
  const navigate = useNavigate();

  const [specializationsMaster, setSpecializationsMaster] = useState<Specialization[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  // Session From/To time pickers
  const [morningFrom, setMorningFrom] = useState('09:00');
  const [morningTo, setMorningTo] = useState('13:00');
  const [eveningFrom, setEveningFrom] = useState('16:00');
  const [eveningTo, setEveningTo] = useState('19:30');

  // Form Fields
  const [formData, setFormData] = useState<DoctorFormData>({
    name: '',
    specialties: [],
    available_days: 'Mon,Tue,Wed,Thu,Fri,Sat',
    slot_duration_minutes: 15,
    morning_slots: generateSlots(9, 0, 13, 0, 15).join(', '),
    evening_slots: generateSlots(16, 0, 19, 30, 15).join(', '),
    is_active: true,
  });

  const [clinicId, setClinicId] = useState<string>('');

  useEffect(() => {
    const initData = async () => {
      try {
        setLoading(true);
        const [specs, clinicList] = await Promise.all([
          getSpecializations(),
          getClinics(),
        ]);
        setSpecializationsMaster(specs);

        if (clinicList.length > 0) {
          setClinicId(clinicList[0].id);
        }

        if (isEditMode && id) {
          const doc = await getDoctor(id);
          const interval = doc.slot_duration_minutes || 15;
          // Split comma-separated specialties
          const parsedSpecialties = doc.specialty
            ? doc.specialty.split(',').map((s) => s.trim()).filter(Boolean)
            : [];

          const mRange = inferRangeFromSlots(doc.morning_slots, interval, '09:00', '13:00');
          const eRange = inferRangeFromSlots(doc.evening_slots, interval, '16:00', '19:30');
          setMorningFrom(mRange.from);
          setMorningTo(mRange.to);
          setEveningFrom(eRange.from);
          setEveningTo(eRange.to);

          setFormData({
            name: doc.name,
            specialties: parsedSpecialties,
            available_days: doc.available_days || 'Mon,Tue,Wed,Thu,Fri,Sat',
            slot_duration_minutes: interval,
            morning_slots: doc.morning_slots || '',
            evening_slots: doc.evening_slots || '',
            is_active: doc.is_active,
          });
          setClinicId(doc.clinic_id);
        }
      } catch (err: any) {
        setErrorMessage(err.response?.data?.detail || 'Failed to load doctor profile data.');
      } finally {
        setLoading(false);
      }
    };
    initData();
  }, [id, isEditMode]);

  // Regenerate Morning & Evening slots using selected From/To times and interval
  const handleRegenerateSlots = (
    interval: number,
    mFrom = morningFrom,
    mTo = morningTo,
    eFrom = eveningFrom,
    eTo = eveningTo
  ) => {
    const morning = generateSlotsFromRange(mFrom, mTo, interval);
    const evening = generateSlotsFromRange(eFrom, eTo, interval);
    setFormData((prev) => ({
      ...prev,
      slot_duration_minutes: interval,
      morning_slots: morning,
      evening_slots: evening,
    }));
  };

  const handleMorningTimeChange = (which: 'from' | 'to', value: string) => {
    const nextFrom = which === 'from' ? value : morningFrom;
    const nextTo = which === 'to' ? value : morningTo;
    if (which === 'from') setMorningFrom(value);
    else setMorningTo(value);
    setFormData((prev) => ({
      ...prev,
      morning_slots: generateSlotsFromRange(nextFrom, nextTo, prev.slot_duration_minutes),
    }));
  };

  const handleEveningTimeChange = (which: 'from' | 'to', value: string) => {
    const nextFrom = which === 'from' ? value : eveningFrom;
    const nextTo = which === 'to' ? value : eveningTo;
    if (which === 'from') setEveningFrom(value);
    else setEveningTo(value);
    setFormData((prev) => ({
      ...prev,
      evening_slots: generateSlotsFromRange(nextFrom, nextTo, prev.slot_duration_minutes),
    }));
  };

  // Toggle specialization checkbox
  const handleToggleSpecialty = (specName: string) => {
    setFormData((prev) => {
      const exists = prev.specialties.includes(specName);
      const next = exists
        ? prev.specialties.filter((s) => s !== specName)
        : [...prev.specialties, specName];
      return { ...prev, specialties: next };
    });
    setFormErrors((prev) => ({ ...prev, specialties: '' }));
  };

  // Toggle available day
  const handleToggleDay = (day: string) => {
    const currentDays = formData.available_days.split(',').map((d) => d.trim()).filter(Boolean);
    const exists = currentDays.includes(day);
    const nextDays = exists
      ? currentDays.filter((d) => d !== day)
      : [...currentDays, day];
    setFormData((prev) => ({ ...prev, available_days: nextDays.join(',') }));
    setFormErrors((prev) => ({ ...prev, available_days: '' }));
  };

  const handleApplyDayPreset = (preset: 'all' | 'weekdays' | 'mon_sat') => {
    if (preset === 'all') {
      setFormData((prev) => ({ ...prev, available_days: DAYS_OF_WEEK.join(',') }));
    } else if (preset === 'weekdays') {
      setFormData((prev) => ({ ...prev, available_days: 'Mon,Tue,Wed,Thu,Fri' }));
    } else if (preset === 'mon_sat') {
      setFormData((prev) => ({ ...prev, available_days: 'Mon,Tue,Wed,Thu,Fri,Sat' }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormErrors({});
    setErrorMessage('');

    const validation = doctorSchema.safeParse(formData);
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
      const payload = {
        name: formData.name.trim(),
        specialties: formData.specialties,
        specialty: formData.specialties.join(', '),
        available_days: formData.available_days,
        slot_duration_minutes: formData.slot_duration_minutes,
        morning_slots: formData.morning_slots,
        evening_slots: formData.evening_slots,
        is_active: formData.is_active,
        clinic_id: clinicId,
      };

      if (isEditMode && id) {
        await updateDoctor(id, payload);
      } else {
        await createDoctor(payload);
      }

      navigate('/doctors');
    } catch (err: any) {
      setErrorMessage(err.response?.data?.detail || 'Failed to save doctor profile.');
    } finally {
      setSaving(false);
    }
  };

  const activeDays = formData.available_days.split(',').map((d) => d.trim()).filter(Boolean);

  if (loading) {
    return (
      <div className="p-12 text-center text-slate-500">
        <Stethoscope className="w-8 h-8 animate-spin mx-auto mb-2 text-indigo-600" />
        <p>Loading doctor profile form...</p>
      </div>
    );
  }

  return (
    <div className="w-full space-y-3.5">
      {/* Top Header */}
      <div className="flex items-center justify-between gap-3 pb-3 border-b border-slate-200">
        <div className="flex items-center gap-2.5">
          <Link
            to="/doctors"
            className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition"
            title="Back to Doctors"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <span className="p-1.5 bg-indigo-50 text-indigo-600 rounded-lg">
                <Stethoscope className="w-4 h-4" />
              </span>
              <h1 className="text-lg font-bold text-slate-900">
                {isEditMode ? 'Edit Doctor Profile & Schedule' : 'Add New Doctor Profile'}
              </h1>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Configure specializations, consultation intervals, and working schedules.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => navigate('/doctors')}
          className="ui-btn-secondary"
        >
          Cancel
        </button>
      </div>

      {/* Error Alert */}
      {errorMessage && (
        <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-lg text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Doctor Form */}
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Step 1: Doctor Personal Info & Status */}
        <div className="ui-card space-y-3.5">
          <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2 pb-2 border-b border-slate-100">
            <User className="w-4 h-4 text-indigo-600" />
            Doctor Information
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="ui-label">
                Doctor Full Name <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <User className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="e.g. Dr. Rajesh Sharma, MD"
                  value={formData.name}
                  onChange={(e) => {
                    const val = e.target.value;
                    setFormData({ ...formData, name: val });
                    setFormErrors((prev) => clearOrValidateField(doctorSchema, 'name', val, prev));
                  }}
                  className={`ui-input pl-8 ${formErrors.name ? 'border-rose-400 bg-rose-50' : ''}`}
                />
              </div>
              {formErrors.name && (
                <p className="text-[11px] text-rose-600 mt-1 font-medium">{formErrors.name}</p>
              )}
            </div>

            <div>
              <label className="ui-label">Active Status</label>
              <div className="flex items-center gap-4 h-9">
                <label className="flex items-center gap-1.5 cursor-pointer text-xs font-medium text-slate-700">
                  <input
                    type="radio"
                    name="is_active"
                    checked={formData.is_active === true}
                    onChange={() => setFormData({ ...formData, is_active: true })}
                    className="text-indigo-600 focus:ring-indigo-500"
                  />
                  Active (Receiving Appointments)
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer text-xs font-medium text-slate-700">
                  <input
                    type="radio"
                    name="is_active"
                    checked={formData.is_active === false}
                    onChange={() => setFormData({ ...formData, is_active: false })}
                    className="text-indigo-600 focus:ring-indigo-500"
                  />
                  Inactive / On Leave
                </label>
              </div>
            </div>
          </div>
        </div>

        {/* Step 2: Multiple Specializations from Master */}
        <div className="ui-card space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pb-2 border-b border-slate-100">
            <div>
              <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                <Layers className="w-4 h-4 text-indigo-600" />
                Medical Specializations <span className="text-rose-500">*</span>
              </h2>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Pick all applicable specialties from the master catalog.
              </p>
            </div>

            <Link
              to="/specializations"
              target="_blank"
              className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-800 bg-indigo-50 px-2.5 py-1 rounded-lg transition"
            >
              <Plus className="w-3.5 h-3.5" />
              Manage Specializations Master
            </Link>
          </div>

          {formErrors.specialties && (
            <p className="text-xs text-rose-600 font-semibold">{formErrors.specialties}</p>
          )}

          {/* Specialization Checkbox Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-2">
            {specializationsMaster.map((spec) => {
              const isChecked = formData.specialties.includes(spec.name);
              return (
                <label
                  key={spec.id}
                  onClick={() => handleToggleSpecialty(spec.name)}
                  className={`flex items-center gap-2 px-2.5 py-2 rounded-lg border cursor-pointer transition select-none text-xs font-medium ${isChecked
                      ? 'bg-indigo-50 border-indigo-300 text-indigo-900 ring-1 ring-indigo-200'
                      : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                    }`}
                >
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => { }}
                    className="w-3.5 h-3.5 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500 cursor-pointer"
                  />
                  <span className="truncate">{spec.name}</span>
                </label>
              );
            })}
          </div>

          {/* Selected Badges */}
          {formData.specialties.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap pt-2">
              <span className="text-xs text-slate-500 font-medium">Selected ({formData.specialties.length}):</span>
              {formData.specialties.map((spec) => (
                <span
                  key={spec}
                  className="inline-flex items-center gap-1 px-2.5 py-1 bg-indigo-100 text-indigo-800 rounded-full text-xs font-semibold"
                >
                  {spec}
                  <button
                    type="button"
                    onClick={() => handleToggleSpecialty(spec)}
                    className="hover:text-rose-600"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Step 3: Time Margin Between Patients & Slot Duration */}
        <div className="ui-card space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pb-2 border-b border-slate-100">
            <div>
              <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                <Clock className="w-4 h-4 text-indigo-600" />
                Schedule, Working Days & Slot Duration <span className="text-rose-500">*</span>
              </h2>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Determines interval (5–30 min) and available days for patient booking slots.
              </p>
            </div>

            <button
              type="button"
              onClick={() => handleRegenerateSlots(formData.slot_duration_minutes)}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 rounded-lg text-xs font-semibold transition"
            >
              <Zap className="w-3.5 h-3.5 text-indigo-600" />
              Auto-Generate Slots ({formData.slot_duration_minutes}m)
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="ui-label">Consultation Interval / Patient Gap</label>
              <SearchableSelect
                value={formData.slot_duration_minutes}
                onChange={(val) => {
                  const numVal = parseInt(val, 10);
                  handleRegenerateSlots(numVal);
                }}
                searchable={false}
                options={INTERVAL_OPTIONS.map((opt) => ({
                  value: opt.value,
                  label: opt.label,
                }))}
              />
              <p className="text-[11px] text-slate-400 mt-1 flex items-center gap-1">
                <Info className="w-3 h-3 text-slate-400" />
                Changing interval regenerates morning and evening slots below.
              </p>
            </div>

            {/* Available Working Days */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="ui-label mb-0">
                  Available Working Days <span className="text-rose-500">*</span>
                </label>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => handleApplyDayPreset('mon_sat')}
                    className="text-[10px] font-semibold text-indigo-600 hover:underline"
                  >
                    Mon-Sat
                  </button>
                  <span className="text-slate-300">|</span>
                  <button
                    type="button"
                    onClick={() => handleApplyDayPreset('weekdays')}
                    className="text-[10px] font-semibold text-indigo-600 hover:underline"
                  >
                    Weekdays
                  </button>
                  <span className="text-slate-300">|</span>
                  <button
                    type="button"
                    onClick={() => handleApplyDayPreset('all')}
                    className="text-[10px] font-semibold text-indigo-600 hover:underline"
                  >
                    All Days
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-1.5 flex-wrap">
                {DAYS_OF_WEEK.map((day) => {
                  const isActive = activeDays.includes(day);
                  return (
                    <button
                      key={day}
                      type="button"
                      onClick={() => handleToggleDay(day)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition border ${isActive
                          ? 'bg-indigo-600 text-white border-indigo-600'
                          : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                        }`}
                    >
                      {day}
                    </button>
                  );
                })}
              </div>
              {formErrors.available_days && (
                <p className="text-[11px] text-rose-600 mt-1 font-medium">{formErrors.available_days}</p>
              )}
            </div>
          </div>

          {/* Morning & Evening From/To Time Pickers + Split Slots Preview */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2.5 border-t border-slate-100">
            {/* Morning Session */}
            <div className="p-3 rounded-lg bg-amber-50/40 border border-amber-200/70 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-amber-400"></span>
                  Morning Session
                </span>
                <span className="text-[11px] font-semibold text-amber-800 bg-amber-100 px-2 py-0.5 rounded-full">
                  {formData.morning_slots ? formData.morning_slots.split(',').filter((s) => s.trim()).length : 0} slots
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="ui-label text-[11px]">From Time</label>
                  <input
                    type="time"
                    value={morningFrom}
                    onChange={(e) => handleMorningTimeChange('from', e.target.value)}
                    className="ui-input"
                  />
                </div>
                <div>
                  <label className="ui-label text-[11px]">To Time</label>
                  <input
                    type="time"
                    value={morningTo}
                    onChange={(e) => handleMorningTimeChange('to', e.target.value)}
                    className="ui-input"
                  />
                </div>
              </div>

              <div>
                <label className="ui-label text-[11px]">Split Slots (Auto-generated by {formData.slot_duration_minutes}m)</label>
                <textarea
                  rows={2}
                  placeholder="Select From & To time above to generate slots..."
                  value={formData.morning_slots || ''}
                  onChange={(e) => setFormData({ ...formData, morning_slots: e.target.value })}
                  className="ui-textarea font-mono bg-white"
                />
              </div>
            </div>

            {/* Evening Session */}
            <div className="p-3 rounded-lg bg-indigo-50/40 border border-indigo-200/70 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-indigo-500"></span>
                  Evening Session
                </span>
                <span className="text-[11px] font-semibold text-indigo-800 bg-indigo-100 px-2 py-0.5 rounded-full">
                  {formData.evening_slots ? formData.evening_slots.split(',').filter((s) => s.trim()).length : 0} slots
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="ui-label text-[11px]">From Time</label>
                  <input
                    type="time"
                    value={eveningFrom}
                    onChange={(e) => handleEveningTimeChange('from', e.target.value)}
                    className="ui-input"
                  />
                </div>
                <div>
                  <label className="ui-label text-[11px]">To Time</label>
                  <input
                    type="time"
                    value={eveningTo}
                    onChange={(e) => handleEveningTimeChange('to', e.target.value)}
                    className="ui-input"
                  />
                </div>
              </div>

              <div>
                <label className="ui-label text-[11px]">Split Slots (Auto-generated by {formData.slot_duration_minutes}m)</label>
                <textarea
                  rows={2}
                  placeholder="Select From & To time above to generate slots..."
                  value={formData.evening_slots || ''}
                  onChange={(e) => setFormData({ ...formData, evening_slots: e.target.value })}
                  className="ui-textarea font-mono bg-white"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Form Actions */}
        <div className="flex items-center justify-end gap-2.5 pt-1">
          <button
            type="button"
            onClick={() => navigate('/doctors')}
            className="ui-btn-secondary"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="ui-btn-primary"
          >
            <Save className="w-3.5 h-3.5" />
            {saving ? 'Saving...' : isEditMode ? 'Update Doctor Profile' : 'Save Doctor Profile'}
          </button>
        </div>
      </form>
    </div>
  );
};
