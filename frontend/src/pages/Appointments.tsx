import React, { useState, useMemo } from 'react';
import { 
  Calendar, 
  Plus, 
  Filter, 
  CheckCircle, 
  XCircle, 
  Clock, 
  MapPin, 
  Phone,
  UserCheck,
  Edit3
} from 'lucide-react';
import { useOutletContext, useNavigate } from 'react-router-dom';
import { Appointment, UserRole, AdminUser, AppContextType } from '../types';
import { updateAppointmentStatus } from '../api/client';
import { DataTable, ColumnDef } from '../components/DataTable';
import { useConfirm } from '../context/ConfirmationContext';

interface AppointmentsProps {
  appointments?: Appointment[];
  onRefresh?: () => void;
  currentUser?: AdminUser | null;
  userRole?: UserRole;
}

export const Appointments: React.FC<AppointmentsProps> = (props) => {
  const navigate = useNavigate();
  const outlet = useOutletContext<AppContextType>();
  const appointments = props.appointments || outlet?.appointments || [];
  const onRefresh = props.onRefresh || outlet?.loadData || (() => {});
  const currentUser = props.currentUser !== undefined ? props.currentUser : outlet?.currentUser;
  const userRole = props.userRole || outlet?.userRole || 'RECEPTIONIST';

  const [statusFilter, setStatusFilter] = useState('ALL');
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const confirm = useConfirm();

  // Dynamic granular action permissions
  const canCreate = userRole !== 'RECEPTIONIST' || currentUser?.permissions?.appointments?.create !== false;
  const canEdit = userRole !== 'RECEPTIONIST' || currentUser?.permissions?.appointments?.edit !== false;
  const canDelete = userRole !== 'RECEPTIONIST' || currentUser?.permissions?.appointments?.delete !== false;

  const showToast = (text: string, type: 'success' | 'error') => {
    setToastMessage({ text, type });
    setTimeout(() => setToastMessage(null), 4000);
  };

  const handleStatusChange = async (id: string, newStatus: string, patientName?: string) => {
    if (newStatus === 'CANCELLED') {
      const ok = await confirm({
        title: 'Cancel Patient Appointment',
        message: `Are you sure you want to cancel the appointment for ${patientName || 'this patient'}?`,
        description: '⚠️ The slot will be freed and made available for other patients to book via WhatsApp or front desk.',
        confirmText: 'Yes, Cancel Appointment',
        cancelText: 'Keep Appointment',
        variant: 'warning',
      });
      if (!ok) return;
    }
    try {
      await updateAppointmentStatus(id, { status: newStatus });
      showToast(`Appointment status updated to ${newStatus}`, 'success');
      onRefresh();
    } catch (err: any) {
      showToast(err.response?.data?.detail || 'Failed to update appointment status', 'error');
    }
  };

  const filteredAppointments = useMemo(() => {
    if (statusFilter === 'ALL') return appointments;
    return appointments.filter((a) => a.status === statusFilter);
  }, [appointments, statusFilter]);

  const columns: ColumnDef<Appointment>[] = useMemo(() => [
    {
      key: 'patient_name',
      header: 'Patient & Contact',
      sortable: true,
      sortValue: (appt: Appointment) => appt.patient_name,
      searchValue: (appt: Appointment) => `${appt.patient_name} ${appt.mobile_number}`,
      render: (appt: Appointment) => (
        <div>
          <p className="font-bold text-slate-900">{appt.patient_name}</p>
          <p className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
            <Phone className="w-3 h-3 text-slate-400" /> {appt.mobile_number}
          </p>
        </div>
      )
    },
    {
      key: 'doctor_name',
      header: 'Doctor & Clinic',
      sortable: true,
      sortValue: (appt: Appointment) => appt.doctor_name,
      searchValue: (appt: Appointment) => `${appt.doctor_name} ${appt.clinic_address || ''}`,
      render: (appt: Appointment) => (
        <div>
          <p className="font-semibold text-slate-800">{appt.doctor_name}</p>
          <p className="text-xs text-slate-400 flex items-center gap-1 mt-0.5 truncate max-w-xs" title={appt.clinic_address}>
            <MapPin className="w-3 h-3 text-slate-400 shrink-0" /> {appt.clinic_address}
          </p>
        </div>
      )
    },
    {
      key: 'appointment_date',
      header: 'Date & Slot',
      sortable: true,
      sortValue: (appt: Appointment) => `${appt.appointment_date} ${appt.time_slot}`,
      render: (appt: Appointment) => (
        <div>
          <p className="font-bold text-indigo-700 flex items-center gap-1">
            <Calendar className="w-3.5 h-3.5" /> {appt.appointment_date}
          </p>
          <p className="text-xs font-semibold text-slate-600 flex items-center gap-1 mt-0.5">
            <Clock className="w-3.5 h-3.5 text-slate-400" /> {appt.time_slot}
          </p>
        </div>
      )
    },
    {
      key: 'status',
      header: 'Status',
      sortable: true,
      sortValue: (appt: Appointment) => appt.status,
      render: (appt: Appointment) => (
        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold ${
          appt.status === 'CONFIRMED'
            ? 'bg-emerald-100 text-emerald-800'
            : appt.status === 'COMPLETED'
            ? 'bg-blue-100 text-blue-800'
            : appt.status === 'RESCHEDULED'
            ? 'bg-purple-100 text-purple-800'
            : 'bg-rose-100 text-rose-800'
        }`}>
          {appt.status}
        </span>
      )
    },
    {
      key: 'reminder_sent',
      header: '1-Hr WhatsApp Reminder',
      sortable: true,
      sortValue: (appt: Appointment) => (appt.reminder_sent ? 1 : 0),
      render: (appt: Appointment) => (
        <>
          {appt.reminder_sent ? (
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600">
              <CheckCircle className="w-3.5 h-3.5" /> Sent on WhatsApp
            </span>
          ) : appt.status === 'CONFIRMED' ? (
            <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-600 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200">
              <Clock className="w-3.5 h-3.5" /> Queued (1-hr prior)
            </span>
          ) : (
            <span className="text-xs text-slate-400">N/A</span>
          )}
        </>
      )
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (appt: Appointment) => (
        <div className="flex items-center justify-end gap-1.5">
          {canEdit && (
            <button
              onClick={() => navigate(`/appointments/${appt.id}/edit`)}
              className="px-2.5 py-1 text-xs font-bold bg-indigo-50 text-indigo-700 hover:bg-indigo-100 rounded-lg transition inline-flex items-center gap-1 border border-indigo-200"
              title="Edit Appointment"
            >
              <Edit3 className="w-3.5 h-3.5" />
              <span>Edit</span>
            </button>
          )}

          {appt.status === 'CONFIRMED' && (
            <>
              {canEdit && (
                <button
                  onClick={() => handleStatusChange(appt.id, 'COMPLETED')}
                  className="px-2.5 py-1 text-xs font-bold bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-lg transition inline-flex items-center gap-1 border border-blue-200"
                  title="Patient Check-in / Complete Visit"
                >
                  <UserCheck className="w-3.5 h-3.5" />
                  <span>Check-In</span>
                </button>
              )}
              {canDelete && (
                <button
                  onClick={() => handleStatusChange(appt.id, 'CANCELLED', appt.patient_name)}
                  className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg transition inline-flex items-center border border-rose-200"
                  title="Cancel Appointment"
                >
                  <XCircle className="w-4 h-4" />
                </button>
              )}
            </>
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

      {/* DataTable with Search, Sort, Pagination & Filter */}
      <DataTable<Appointment>
        title={userRole === 'RECEPTIONIST' ? 'Front Desk Live Appointments Queue' : 'Appointments Management'}
        subtitle={
          userRole === 'RECEPTIONIST'
            ? 'Patient check-in, front-desk booking, and appointment status updates'
            : 'View, manage, and book patient visits across clinics'
        }
        data={filteredAppointments}
        columns={columns}
        keyExtractor={(a) => a.id}
        searchPlaceholder="Search patient name, doctor, or mobile..."
        extraFilters={
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs font-semibold text-slate-400 flex items-center gap-1 mr-1">
              <Filter className="w-3.5 h-3.5" /> Status:
            </span>
            {['ALL', 'CONFIRMED', 'COMPLETED', 'CANCELLED', 'RESCHEDULED'].map((st) => (
              <button
                key={st}
                onClick={() => setStatusFilter(st)}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition whitespace-nowrap ${
                  statusFilter === st
                    ? 'bg-indigo-600 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {st}
              </button>
            ))}
          </div>
        }
        actionButton={
          canCreate ? (
            <button
              onClick={() => navigate('/appointments/new')}
              className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm transition shadow-sm flex items-center gap-2"
            >
              <Plus className="w-4 h-4" /> Book Patient Appointment
            </button>
          ) : undefined
        }
        emptyMessage="No appointments found matching your filters."
        defaultPageSize={10}
        initialSortKey="appointment_date"
        initialSortDir="desc"
      />
    </div>
  );
};
