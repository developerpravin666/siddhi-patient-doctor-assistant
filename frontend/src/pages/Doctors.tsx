import React, { useState } from 'react';
import {
  Clock,
  Calendar,
  Stethoscope,
  Plus,
  ShieldAlert,
  Edit3,
  Sun,
  Moon,
  Trash2,
  CheckCircle2,
  XCircle,
  Filter,
  Search,
  Layers
} from 'lucide-react';
import { useOutletContext, useNavigate, Link } from 'react-router-dom';
import { Doctor, UserRole, AdminUser, AppContextType } from '../types';
import { deleteDoctor, toggleDoctorStatus } from '../api/client';

interface DoctorsProps {
  doctors?: Doctor[];
  currentUser?: AdminUser | null;
  userRole?: UserRole;
  onRefresh?: () => void;
}

export const parseSlots = (slots?: string | null): string[] => {
  if (!slots || typeof slots !== 'string') return [];
  return slots
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
};

export const Doctors: React.FC<DoctorsProps> = (props) => {
  const navigate = useNavigate();
  const outlet = useOutletContext<AppContextType>();
  const doctors = props.doctors || outlet?.doctors || [];
  const onRefresh = props.onRefresh || outlet?.loadData || (() => {});
  const currentUser = props.currentUser !== undefined ? props.currentUser : outlet?.currentUser;
  const userRole = props.userRole || outlet?.userRole || 'RECEPTIONIST';

  const [searchTerm, setSearchTerm] = useState('');
  const [specialtyFilter, setSpecialtyFilter] = useState('ALL');
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const canCreate = userRole !== 'RECEPTIONIST' || currentUser?.permissions?.doctors?.create !== false;
  const canEdit = userRole !== 'RECEPTIONIST' || currentUser?.permissions?.doctors?.edit !== false;
  const canDelete = userRole !== 'RECEPTIONIST' || currentUser?.permissions?.doctors?.delete !== false;

  const showToast = (text: string, type: 'success' | 'error') => {
    setToastMessage({ text, type });
    setTimeout(() => setToastMessage(null), 4000);
  };

  const handleToggleStatus = async (doctor: Doctor) => {
    const nextStatus = !doctor.is_active;
    try {
      await toggleDoctorStatus(doctor.id, nextStatus);
      showToast(`Doctor ${doctor.name} ${nextStatus ? 'activated' : 'deactivated'} successfully.`, 'success');
      if (onRefresh) onRefresh();
    } catch (err: any) {
      showToast(err.response?.data?.detail || 'Failed to update doctor status', 'error');
    }
  };

  const handleDeleteDoctor = async (doctor: Doctor) => {
    if (!window.confirm(`Are you sure you want to delete profile for Dr. ${doctor.name}? This action cannot be undone.`)) {
      return;
    }
    try {
      await deleteDoctor(doctor.id);
      showToast(`Doctor ${doctor.name} removed successfully.`, 'success');
      if (onRefresh) onRefresh();
    } catch (err: any) {
      showToast(err.response?.data?.detail || 'Failed to delete doctor', 'error');
    }
  };

  // Collect unique specialties
  const allSpecialties = Array.from(
    new Set(
      doctors.flatMap((d) => (d.specialty ? d.specialty.split(',').map((s) => s.trim()) : []))
    )
  ).filter(Boolean);

  const filteredDoctors = doctors.filter((doc) => {
    const matchesSearch =
      doc.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (doc.specialty && doc.specialty.toLowerCase().includes(searchTerm.toLowerCase()));

    const matchesSpecialty =
      specialtyFilter === 'ALL' ||
      (doc.specialty && doc.specialty.toLowerCase().includes(specialtyFilter.toLowerCase()));

    return matchesSearch && matchesSpecialty;
  });

  return (
    <div className="space-y-6">
      {/* Toast Alert */}
      {toastMessage && (
        <div
          className={`p-3.5 rounded-xl border text-xs font-semibold flex items-center justify-between transition shadow-sm ${
            toastMessage.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}
        >
          <span>{toastMessage.type === 'success' ? '✓ ' : '✕ '} {toastMessage.text}</span>
          <button onClick={() => setToastMessage(null)} className="font-bold opacity-70 hover:opacity-100">
            ✕
          </button>
        </div>
      )}

      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <Stethoscope className="w-5 h-5 text-indigo-600" />
            Doctors & Consultation Schedules
          </h2>
          <p className="text-xs text-slate-500">
            Physicians by master specializations, time margins (5, 10, 15 min), and active consultation slots
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <Link
            to="/specializations"
            className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs transition flex items-center gap-1.5"
          >
            <Layers className="w-3.5 h-3.5 text-slate-500" />
            Specializations Master
          </Link>

          {canCreate ? (
            <button
              onClick={() => navigate('/doctors/new')}
              className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm transition shadow-sm flex items-center gap-2 shrink-0"
            >
              <Plus className="w-4 h-4" /> Add Doctor Profile
            </button>
          ) : (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 text-slate-600 text-xs font-semibold">
              <ShieldAlert className="w-3.5 h-3.5 text-slate-400" />
              <span>Schedule Access: {canEdit ? 'Edit Enabled' : 'Read-Only'}</span>
            </div>
          )}
        </div>
      </div>

      {/* Filters: Search & Specialization */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white p-3 rounded-2xl border border-slate-200 shadow-sm">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search by doctor name or specialization..."
            className="w-full pl-9 pr-4 py-1.5 rounded-xl border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Filter className="w-3.5 h-3.5 text-slate-400" />
          <span className="text-xs font-bold text-slate-600">Specialization:</span>
          <select
            value={specialtyFilter}
            onChange={(e) => setSpecialtyFilter(e.target.value)}
            className="text-xs px-2.5 py-1.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 bg-white"
          >
            <option value="ALL">All Specializations ({allSpecialties.length})</option>
            {allSpecialties.map((spec) => (
              <option key={spec} value={spec}>
                {spec}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Doctors Grid */}
      {filteredDoctors.length === 0 ? (
        <div className="p-12 text-center text-slate-400 text-sm bg-white rounded-2xl border border-slate-200 shadow-sm">
          No doctors found matching your criteria.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredDoctors.map((doc) => {
            const morningSlots = parseSlots(doc.morning_slots);
            const eveningSlots = parseSlots(doc.evening_slots);
            const totalSlots = morningSlots.length + eveningSlots.length;
            const isDocActive = doc.is_active !== false;

            const specialtyList = doc.specialty ? doc.specialty.split(',').map((s) => s.trim()) : ['General Physician'];

            return (
              <div
                key={doc.id}
                className={`bg-white rounded-2xl border transition shadow-sm hover:shadow-md p-5 space-y-4 flex flex-col justify-between ${
                  isDocActive ? 'border-slate-200/90' : 'border-rose-200 bg-rose-50/20'
                }`}
              >
                <div>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center space-x-3">
                      <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-indigo-600 to-sky-400 flex items-center justify-center text-white shadow-md shrink-0">
                        <Stethoscope className="w-6 h-6" />
                      </div>
                      <div>
                        <h3 className="font-bold text-slate-900 text-base">{doc.name}</h3>
                        <div className="flex flex-wrap gap-1 mt-0.5">
                          {specialtyList.map((sp) => (
                            <span key={sp} className="text-[10px] bg-indigo-50 text-indigo-700 font-semibold px-1.5 py-0.5 rounded">
                              {sp}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* 1-Click Status Badge */}
                    <div className="flex flex-col items-end gap-1">
                      <button
                        onClick={() => canEdit && handleToggleStatus(doc)}
                        disabled={!canEdit}
                        className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold transition shadow-sm ${
                          isDocActive
                            ? 'bg-emerald-100 text-emerald-800 border border-emerald-200 hover:bg-emerald-200'
                            : 'bg-rose-100 text-rose-800 border border-rose-200 hover:bg-rose-200'
                        } ${!canEdit ? 'cursor-default' : 'cursor-pointer'}`}
                        title={canEdit ? 'Click to toggle Active / Deactive' : undefined}
                      >
                        {isDocActive ? (
                          <>
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" /> Active
                          </>
                        ) : (
                          <>
                            <XCircle className="w-3 h-3 text-rose-600" /> Deactivated
                          </>
                        )}
                      </button>
                      <span className="text-[10px] text-slate-400 font-medium">{totalSlots} slots total</span>
                    </div>
                  </div>

                  {/* Working Days & Interval Difference */}
                  <div className="grid grid-cols-2 gap-2 p-2.5 rounded-xl bg-slate-50 border border-slate-100 text-xs mt-3">
                    <div>
                      <span className="font-semibold text-slate-500 flex items-center gap-1 text-[11px] mb-0.5">
                        <Calendar className="w-3 h-3 text-indigo-600" /> Working Days
                      </span>
                      <span className="font-bold text-slate-800">{doc.available_days || 'Mon–Sat'}</span>
                    </div>
                    <div>
                      <span className="font-semibold text-slate-500 flex items-center gap-1 text-[11px] mb-0.5">
                        <Clock className="w-3 h-3 text-indigo-600" /> Patient Interval
                      </span>
                      <span className="font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-md inline-block">
                        {doc.slot_duration_minutes || 15} Minutes
                      </span>
                    </div>
                  </div>

                  {/* Morning Slots */}
                  <div className="space-y-1.5 border-t border-slate-100 pt-3 mt-3">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                        <Sun className="w-3.5 h-3.5 text-amber-500" /> Morning Consultation
                      </p>
                      <span className="text-[11px] font-semibold text-slate-400">
                        {morningSlots.length > 0 ? `${morningSlots.length} slots` : 'None'}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1 max-h-20 overflow-y-auto">
                      {morningSlots.length > 0 ? (
                        morningSlots.map((slot) => (
                          <span
                            key={slot}
                            className="px-2 py-0.5 bg-amber-50 border border-amber-200/60 text-amber-900 rounded text-[10px] font-semibold"
                          >
                            {slot}
                          </span>
                        ))
                      ) : (
                        <span className="text-[11px] text-slate-400 italic">No morning slots</span>
                      )}
                    </div>
                  </div>

                  {/* Evening Slots */}
                  <div className="space-y-1.5 border-t border-slate-100 pt-3 mt-3">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                        <Moon className="w-3.5 h-3.5 text-indigo-500" /> Evening Consultation
                      </p>
                      <span className="text-[11px] font-semibold text-slate-400">
                        {eveningSlots.length > 0 ? `${eveningSlots.length} slots` : 'None'}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1 max-h-20 overflow-y-auto">
                      {eveningSlots.length > 0 ? (
                        eveningSlots.map((slot) => (
                          <span
                            key={slot}
                            className="px-2 py-0.5 bg-indigo-50 border border-indigo-200/60 text-indigo-900 rounded text-[10px] font-semibold"
                          >
                            {slot}
                          </span>
                        ))
                      ) : (
                        <span className="text-[11px] text-slate-400 italic">No evening slots</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Actions: Edit & Delete */}
                <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100 mt-2">
                  {canEdit && (
                    <button
                      onClick={() => navigate(`/doctors/${doc.id}/edit`)}
                      className="px-3 py-1.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-bold transition flex items-center gap-1.5"
                    >
                      <Edit3 className="w-3.5 h-3.5" /> Edit Profile & Schedule
                    </button>
                  )}
                  {canDelete && (
                    <button
                      onClick={() => handleDeleteDoctor(doc)}
                      className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-xl transition"
                      title="Delete Doctor"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
