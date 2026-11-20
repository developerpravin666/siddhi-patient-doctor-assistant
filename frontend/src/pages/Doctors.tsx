import React, { useState, useMemo } from 'react';
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
  Layers
} from 'lucide-react';
import { useOutletContext, useNavigate, Link } from 'react-router-dom';
import { Doctor, UserRole, AdminUser, AppContextType } from '../types';
import { deleteDoctor, toggleDoctorStatus } from '../api/client';
import { DataTable, ColumnDef } from '../components/DataTable';
import { useConfirm } from '../context/ConfirmationContext';

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

  const [specialtyFilter, setSpecialtyFilter] = useState('ALL');
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const confirm = useConfirm();

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
    const ok = await confirm({
      title: 'Delete Doctor Profile',
      message: `Are you sure you want to permanently delete profile for Dr. ${doctor.name}?`,
      description: '⚠️ This action cannot be undone. All consultation schedules and slot configurations for this doctor will be erased.',
      confirmText: 'Delete Doctor Profile',
      cancelText: 'Keep Doctor',
      variant: 'danger',
    });
    if (!ok) return;

    try {
      await deleteDoctor(doctor.id);
      showToast(`Doctor ${doctor.name} removed successfully.`, 'success');
      if (onRefresh) onRefresh();
    } catch (err: any) {
      showToast(err.response?.data?.detail || 'Failed to delete doctor', 'error');
    }
  };

  // Collect unique specialties
  const allSpecialties = useMemo(() => {
    return Array.from(
      new Set(
        doctors.flatMap((d) => (d.specialty ? d.specialty.split(',').map((s) => s.trim()) : []))
      )
    ).filter(Boolean);
  }, [doctors]);

  const filteredDoctors = useMemo(() => {
    if (specialtyFilter === 'ALL') return doctors;
    return doctors.filter(
      (doc) => doc.specialty && doc.specialty.toLowerCase().includes(specialtyFilter.toLowerCase())
    );
  }, [doctors, specialtyFilter]);

  const columns: ColumnDef<Doctor>[] = useMemo(() => [
    {
      key: 'name',
      header: 'Doctor & Specializations',
      sortable: true,
      sortValue: (doc: Doctor) => doc.name,
      searchValue: (doc: Doctor) => `${doc.name} ${doc.specialty || ''}`,
      render: (doc: Doctor) => {
        const specialtyList = doc.specialty
          ? doc.specialty.split(',').map((s) => s.trim())
          : ['General Physician'];
        return (
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 to-sky-400 flex items-center justify-center text-white shadow-sm shrink-0">
              <Stethoscope className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-sm">{doc.name}</h3>
              <div className="flex flex-wrap gap-1 mt-1">
                {specialtyList.map((sp) => (
                  <span
                    key={sp}
                    className="text-[10px] bg-indigo-50 text-indigo-700 font-semibold px-1.5 py-0.5 rounded border border-indigo-100"
                  >
                    {sp}
                  </span>
                ))}
              </div>
            </div>
          </div>
        );
      }
    },
    {
      key: 'available_days',
      header: 'Working Days',
      sortable: true,
      sortValue: (doc: Doctor) => doc.available_days || 'Mon–Sat',
      render: (doc: Doctor) => (
        <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-800">
          <Calendar className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
          <span>{doc.available_days || 'Mon–Sat'}</span>
        </div>
      )
    },
    {
      key: 'slot_duration_minutes',
      header: 'Patient Margin',
      sortable: true,
      sortValue: (doc: Doctor) => doc.slot_duration_minutes || 15,
      render: (doc: Doctor) => (
        <div className="flex items-center gap-1 text-xs">
          <Clock className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
          <span className="font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-md border border-indigo-100">
            {doc.slot_duration_minutes || 15} Mins
          </span>
        </div>
      )
    },
    {
      key: 'slots',
      header: 'Consultation Slots',
      render: (doc: Doctor) => {
        const morningSlots = parseSlots(doc.morning_slots);
        const eveningSlots = parseSlots(doc.evening_slots);
        const total = morningSlots.length + eveningSlots.length;
        return (
          <div className="space-y-1">
            <div className="text-xs font-bold text-slate-800">{total} slots total</div>
            <div className="flex items-center gap-2 text-[11px] text-slate-500">
              <span className="flex items-center gap-1 text-amber-700 font-medium bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200/50">
                <Sun className="w-3 h-3 text-amber-500" /> {morningSlots.length} morning
              </span>
              <span className="flex items-center gap-1 text-indigo-700 font-medium bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-200/50">
                <Moon className="w-3 h-3 text-indigo-500" /> {eveningSlots.length} evening
              </span>
            </div>
          </div>
        );
      }
    },
    {
      key: 'is_active',
      header: 'Status',
      sortable: true,
      sortValue: (doc: Doctor) => (doc.is_active !== false ? 1 : 0),
      render: (doc: Doctor) => {
        const isDocActive = doc.is_active !== false;
        return (
          <button
            onClick={() => canEdit && handleToggleStatus(doc)}
            disabled={!canEdit}
            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold transition shadow-xs ${
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
        );
      }
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (doc: Doctor) => (
        <div className="flex items-center justify-end gap-1.5">
          {canEdit && (
            <button
              onClick={() => navigate(`/doctors/${doc.id}/edit`)}
              className="px-2.5 py-1 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-bold transition flex items-center gap-1"
              title="Edit Profile & Schedule"
            >
              <Edit3 className="w-3.5 h-3.5" />
              <span>Edit</span>
            </button>
          )}
          {canDelete && (
            <button
              onClick={() => handleDeleteDoctor(doc)}
              className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg transition"
              title="Delete Doctor"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      )
    }
  ], [canEdit, canDelete, navigate]);

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

      {/* DataTable with Search, Sort, Pagination, and Specialization Filter */}
      <DataTable<Doctor>
        title="Doctors & Consultation Schedules"
        subtitle="Physicians by master specializations, time margins (5, 10, 15 min), and active consultation slots"
        data={filteredDoctors}
        columns={columns}
        keyExtractor={(d) => d.id}
        searchPlaceholder="Search doctor name or specialization..."
        extraFilters={
          <div className="flex items-center gap-2">
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
        }
        actionButton={
          <div className="flex items-center gap-2">
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
        }
        emptyMessage="No doctors found matching your criteria."
        defaultPageSize={10}
        initialSortKey="name"
        initialSortDir="asc"
      />
    </div>
  );
};
