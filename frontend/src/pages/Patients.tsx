import React, { useState } from 'react';
import {
  Search,
  Phone,
  Mail,
  UserPlus,
  Edit2,
  Trash2,
  CheckCircle2,
  XCircle,
  MapPin,
  User,
  Filter,
} from 'lucide-react';
import { useOutletContext, useNavigate } from 'react-router-dom';
import { Patient, UserRole, AdminUser, AppContextType } from '../types';
import { deletePatient, togglePatientStatus } from '../api/client';

interface PatientsProps {
  patients?: Patient[];
  currentUser?: AdminUser | null;
  userRole?: UserRole;
  onRefresh?: () => void;
}

export const Patients: React.FC<PatientsProps> = (props) => {
  const navigate = useNavigate();
  const outlet = useOutletContext<AppContextType>();
  const patients = props.patients || outlet?.patients || [];
  const currentUser = props.currentUser !== undefined ? props.currentUser : outlet?.currentUser;
  const userRole = props.userRole || outlet?.userRole || 'RECEPTIONIST';
  const onRefresh = props.onRefresh || outlet?.loadData;

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const canManage =
    userRole === 'SUPER_ADMIN' ||
    userRole === 'CLINIC_ADMIN' ||
    currentUser?.permissions?.patients?.edit === true;

  const canDelete =
    userRole === 'SUPER_ADMIN' ||
    userRole === 'CLINIC_ADMIN' ||
    currentUser?.permissions?.patients?.delete === true;

  const showToast = (text: string, type: 'success' | 'error') => {
    setToastMessage({ text, type });
    setTimeout(() => setToastMessage(null), 4000);
  };

  const handleToggleStatus = async (patient: Patient) => {
    const nextStatus = !patient.is_active;
    try {
      await togglePatientStatus(patient.id, nextStatus);
      showToast(`Patient ${patient.full_name} status updated to ${nextStatus ? 'Active' : 'Inactive'}.`, 'success');
      if (onRefresh) onRefresh();
    } catch (err: any) {
      showToast(err.response?.data?.detail || 'Failed to update patient status', 'error');
    }
  };

  const handleDelete = async (patient: Patient) => {
    if (!window.confirm(`Are you sure you want to delete patient "${patient.full_name}"? This action cannot be undone.`)) {
      return;
    }
    try {
      await deletePatient(patient.id);
      showToast(`Patient ${patient.full_name} deleted successfully.`, 'success');
      if (onRefresh) onRefresh();
    } catch (err: any) {
      showToast(err.response?.data?.detail || 'Failed to delete patient', 'error');
    }
  };

  const filtered = patients.filter((p) => {
    const matchesSearch =
      p.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.mobile_number.includes(searchTerm) ||
      (p.email && p.email.toLowerCase().includes(searchTerm.toLowerCase()));

    const isPatientActive = p.is_active !== false && p.status !== 'INACTIVE';
    const matchesStatus =
      statusFilter === 'ALL' ||
      (statusFilter === 'ACTIVE' && isPatientActive) ||
      (statusFilter === 'INACTIVE' && !isPatientActive);

    return matchesSearch && matchesStatus;
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

      {/* Header Banner & Controls */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <User className="w-5 h-5 text-indigo-600" />
            Patients Directory
          </h2>
          <p className="text-xs text-slate-500">
            Manage patient records, contact information, active/inactive statuses, and WhatsApp notifications
          </p>
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto">
          {/* Status Filter */}
          <div className="flex items-center bg-white border border-slate-200 rounded-xl p-1 text-xs font-semibold">
            <Filter className="w-3.5 h-3.5 text-slate-400 ml-2 mr-1" />
            <button
              onClick={() => setStatusFilter('ALL')}
              className={`px-2.5 py-1 rounded-lg transition ${
                statusFilter === 'ALL' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              All ({patients.length})
            </button>
            <button
              onClick={() => setStatusFilter('ACTIVE')}
              className={`px-2.5 py-1 rounded-lg transition ${
                statusFilter === 'ACTIVE' ? 'bg-emerald-600 text-white' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Active
            </button>
            <button
              onClick={() => setStatusFilter('INACTIVE')}
              className={`px-2.5 py-1 rounded-lg transition ${
                statusFilter === 'INACTIVE' ? 'bg-rose-600 text-white' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Inactive
            </button>
          </div>

          {canManage && (
            <button
              onClick={() => navigate('/patients/new')}
              className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm transition shadow-sm flex items-center gap-2 shrink-0"
            >
              <UserPlus className="w-4 h-4" /> Add Patient
            </button>
          )}
        </div>
      </div>

      {/* Search Input */}
      <div className="relative w-full max-w-md">
        <Search className="w-4 h-4 absolute left-3.5 top-3 text-slate-400" />
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Search patient by name, mobile, or email..."
          className="w-full pl-10 pr-4 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 bg-white"
        />
      </div>

      {/* Patients Table Card */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
        {filtered.length === 0 ? (
          <div className="text-center py-16 text-slate-400 text-sm space-y-2">
            <User className="w-10 h-10 mx-auto text-slate-300" />
            <p className="font-semibold text-slate-600">No patients matching your search</p>
            <p className="text-xs text-slate-400">
              {searchTerm ? 'Try adjusting your search query or status filter.' : 'Click "Add Patient" to register new records!'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/75 border-b border-slate-200 text-slate-500 text-[11px] font-bold uppercase tracking-wider">
                  <th className="py-3.5 px-4">Patient Profile</th>
                  <th className="py-3.5 px-4">Mobile & WhatsApp</th>
                  <th className="py-3.5 px-4">Demographics</th>
                  <th className="py-3.5 px-4">Status & State</th>
                  <th className="py-3.5 px-4">Registered</th>
                  <th className="py-3.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {filtered.map((patient) => {
                  const isPatientActive = patient.is_active !== false && patient.status !== 'INACTIVE';

                  return (
                    <tr key={patient.id} className="hover:bg-slate-50/60 transition">
                      {/* Name & Initials */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center space-x-3">
                          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-600 to-sky-400 text-white font-bold flex items-center justify-center text-xs shadow-sm shrink-0">
                            {patient.full_name.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <span className="font-bold text-slate-900 block">{patient.full_name}</span>
                            {patient.email ? (
                              <span className="text-[11px] text-slate-500 flex items-center gap-1">
                                <Mail className="w-3 h-3 text-slate-400" /> {patient.email}
                              </span>
                            ) : (
                              <span className="text-[10px] text-slate-400 italic">No email on file</span>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Phone */}
                      <td className="py-3.5 px-4 text-slate-700 font-medium">
                        <div className="flex items-center gap-1.5">
                          <Phone className="w-3.5 h-3.5 text-emerald-600" />
                          <span className="font-mono text-xs font-semibold">{patient.mobile_number}</span>
                        </div>
                      </td>

                      {/* Demographics: Gender, Age, Address */}
                      <td className="py-3.5 px-4 text-xs text-slate-600">
                        <div className="space-y-0.5">
                          <span>
                            {patient.gender || 'Unspecified'}
                            {patient.age ? ` • ${patient.age} yrs` : ''}
                          </span>
                          {patient.address && (
                            <span className="text-[11px] text-slate-400 flex items-center gap-1 truncate max-w-[180px]">
                              <MapPin className="w-3 h-3 text-slate-400 shrink-0" /> {patient.address}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Active/Inactive Status Toggle Button */}
                      <td className="py-3.5 px-4">
                        <button
                          onClick={() => canManage && handleToggleStatus(patient)}
                          disabled={!canManage}
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold transition shadow-sm ${
                            isPatientActive
                              ? 'bg-emerald-100 text-emerald-800 border border-emerald-200 hover:bg-emerald-200'
                              : 'bg-rose-100 text-rose-800 border border-rose-200 hover:bg-rose-200'
                          } ${!canManage ? 'cursor-default' : 'cursor-pointer'}`}
                          title={canManage ? 'Click to toggle Active / Inactive' : undefined}
                        >
                          {isPatientActive ? (
                            <>
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                              <span>Active</span>
                            </>
                          ) : (
                            <>
                              <XCircle className="w-3.5 h-3.5 text-rose-600" />
                              <span>Inactive</span>
                            </>
                          )}
                        </button>
                      </td>

                      {/* Registration Date */}
                      <td className="py-3.5 px-4 text-xs text-slate-500 font-medium">
                        {new Date(patient.created_at).toLocaleDateString(undefined, {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                        })}
                      </td>

                      {/* Action buttons (Edit & Delete) */}
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {canManage && (
                            <button
                              onClick={() => navigate(`/patients/${patient.id}/edit`)}
                              className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-slate-100 rounded-lg transition"
                              title="Edit Patient Information"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {canDelete && (
                            <button
                              onClick={() => handleDelete(patient)}
                              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition"
                              title="Delete Patient Record"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
