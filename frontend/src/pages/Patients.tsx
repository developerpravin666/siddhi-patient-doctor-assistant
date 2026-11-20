import React, { useState, useMemo } from 'react';
import {
  Phone,
  Mail,
  UserPlus,
  Edit2,
  Trash2,
  CheckCircle2,
  XCircle,
  MapPin,
  Filter,
} from 'lucide-react';
import { useOutletContext, useNavigate } from 'react-router-dom';
import { Patient, UserRole, AdminUser, AppContextType } from '../types';
import { deletePatient, togglePatientStatus } from '../api/client';
import { DataTable, ColumnDef } from '../components/DataTable';
import { useConfirm } from '../context/ConfirmationContext';

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

  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const confirm = useConfirm();

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
    const ok = await confirm({
      title: 'Delete Patient Record',
      message: `Are you sure you want to permanently delete patient "${patient.full_name}" (${patient.mobile_number})?`,
      description: '⚠️ This will remove the patient demographic records. Previous appointment logs may remain archived.',
      confirmText: 'Delete Patient',
      cancelText: 'Keep Patient',
      variant: 'danger',
    });
    if (!ok) return;

    try {
      await deletePatient(patient.id);
      showToast(`Patient ${patient.full_name} deleted successfully.`, 'success');
      if (onRefresh) onRefresh();
    } catch (err: any) {
      showToast(err.response?.data?.detail || 'Failed to delete patient', 'error');
    }
  };

  // Filter by status dropdown
  const filteredPatients = useMemo(() => {
    return patients.filter((p) => {
      const isPatientActive = p.is_active !== false && p.status !== 'INACTIVE';
      if (statusFilter === 'ACTIVE') return isPatientActive;
      if (statusFilter === 'INACTIVE') return !isPatientActive;
      return true;
    });
  }, [patients, statusFilter]);

  const columns: ColumnDef<Patient>[] = [
    {
      key: 'full_name',
      header: 'Patient Name',
      sortable: true,
      searchValue: (p) => `${p.full_name} ${p.mobile_number} ${p.email || ''} ${p.address || ''}`,
      render: (patient) => (
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-indigo-50 text-indigo-700 flex items-center justify-center font-bold text-xs shadow-inner">
            {patient.full_name.charAt(0).toUpperCase()}
          </div>
          <div>
            <p className="font-bold text-slate-900 text-xs sm:text-sm">{patient.full_name}</p>
            <p className="text-[11px] text-slate-400 font-mono">ID: {patient.id.slice(0, 8)}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'mobile_number',
      header: 'Contact Info',
      sortable: true,
      render: (patient) => (
        <div className="space-y-0.5">
          <div className="flex items-center gap-1.5 font-medium text-slate-700">
            <Phone className="w-3 h-3 text-slate-400" />
            <span>{patient.mobile_number}</span>
          </div>
          {patient.email && (
            <div className="flex items-center gap-1.5 text-slate-400 text-[11px]">
              <Mail className="w-3 h-3 text-slate-400" />
              <span>{patient.email}</span>
            </div>
          )}
        </div>
      ),
    },
    {
      key: 'age',
      header: 'Demographics',
      sortable: true,
      render: (patient) => (
        <div className="text-slate-600 text-xs">
          {patient.age ? `${patient.age} yrs` : 'Age N/A'}
          {patient.gender && <span className="text-slate-400 ml-1.5 capitalize">({patient.gender.toLowerCase()})</span>}
        </div>
      ),
    },
    {
      key: 'address',
      header: 'Address',
      sortable: false,
      render: (patient) => (
        <div className="text-slate-500 text-xs max-w-xs truncate">
          {patient.address ? (
            <span className="flex items-center gap-1">
              <MapPin className="w-3 h-3 text-slate-400 flex-shrink-0" />
              <span className="truncate">{patient.address}</span>
            </span>
          ) : (
            <span className="text-slate-300 italic">Not provided</span>
          )}
        </div>
      ),
    },
    {
      key: 'is_active',
      header: 'Status',
      sortable: true,
      render: (patient) => {
        const isActive = patient.is_active !== false && patient.status !== 'INACTIVE';
        return (
          <span
            className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${
              isActive ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-slate-100 text-slate-600 border border-slate-200'
            }`}
          >
            {isActive ? <CheckCircle2 className="w-3 h-3 text-emerald-600" /> : <XCircle className="w-3 h-3 text-slate-400" />}
            {isActive ? 'Active' : 'Inactive'}
          </span>
        );
      },
    },
    {
      key: 'actions',
      header: 'Actions',
      sortable: false,
      align: 'right',
      render: (patient) => (
        <div className="flex items-center justify-end gap-1.5">
          {canManage && (
            <button
              onClick={() => handleToggleStatus(patient)}
              title={patient.is_active ? 'Mark Inactive' : 'Mark Active'}
              className="px-2 py-1 text-[11px] font-semibold rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-600 transition"
            >
              {patient.is_active ? 'Deactivate' : 'Activate'}
            </button>
          )}

          {canManage && (
            <button
              onClick={() => navigate(`/patients/${patient.id}/edit`)}
              title="Edit Patient Profile"
              className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg border border-transparent hover:border-indigo-200 transition"
            >
              <Edit2 className="w-3.5 h-3.5" />
            </button>
          )}

          {canDelete && (
            <button
              onClick={() => handleDelete(patient)}
              title="Delete Patient Record"
              className="p-1.5 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-lg border border-transparent hover:border-rose-200 transition"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      ),
    },
  ];

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

      {/* Main Grid with Searching, Sorting, and Paging */}
      <DataTable<Patient>
        title="Patients Directory"
        subtitle="Manage patient records, contact information, active/inactive statuses, and WhatsApp notifications"
        data={filteredPatients}
        columns={columns}
        searchPlaceholder="Search patients by name, phone, or email..."
        emptyMessage="No patients found matching your search criteria."
        defaultPageSize={10}
        initialSortKey="full_name"
        extraFilters={
          <div className="flex items-center gap-1.5">
            <Filter className="w-3.5 h-3.5 text-slate-400" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="py-1.5 px-2.5 border border-slate-200 rounded-xl text-xs bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
            >
              <option value="ALL">All Statuses</option>
              <option value="ACTIVE">Active Only</option>
              <option value="INACTIVE">Inactive Only</option>
            </select>
          </div>
        }
        actionButton={
          <button
            onClick={() => navigate('/patients/new')}
            className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs transition shadow-sm flex items-center gap-1.5"
          >
            <UserPlus className="w-3.5 h-3.5" />
            <span>Add Patient</span>
          </button>
        }
      />
    </div>
  );
};
