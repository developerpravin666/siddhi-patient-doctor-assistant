import React, { useState } from 'react';
import { 
  Calendar, 
  Search, 
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

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');

  // Dynamic granular action permissions
  const canCreate = userRole !== 'RECEPTIONIST' || currentUser?.permissions?.appointments?.create !== false;
  const canEdit = userRole !== 'RECEPTIONIST' || currentUser?.permissions?.appointments?.edit !== false;
  const canDelete = userRole !== 'RECEPTIONIST' || currentUser?.permissions?.appointments?.delete !== false;

  const handleStatusChange = async (id: string, newStatus: string) => {
    try {
      await updateAppointmentStatus(id, { status: newStatus });
      onRefresh();
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Failed to update appointment status');
    }
  };

  const filtered = appointments.filter((appt) => {
    const matchesSearch = 
      appt.patient_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      appt.mobile_number.includes(searchTerm) ||
      appt.doctor_name.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesStatus = statusFilter === 'ALL' || appt.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  return (
    <div className="space-y-6">
      {/* Header bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900">
            {userRole === 'RECEPTIONIST' ? 'Front Desk Live Appointments Queue' : 'Appointments Management'}
          </h2>
          <p className="text-xs text-slate-500">
            {userRole === 'RECEPTIONIST' 
              ? 'Patient check-in, front-desk booking, and appointment status updates'
              : 'View, manage, and book patient visits across clinics'}
          </p>
        </div>
        {canCreate && (
          <button
            onClick={() => navigate('/appointments/new')}
            className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm transition shadow-sm flex items-center gap-2"
          >
            <Plus className="w-4 h-4" /> Book Patient Appointment
          </button>
        )}
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 absolute left-3.5 top-3 text-slate-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search patient name, doctor, or mobile..."
            className="w-full pl-10 pr-4 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
          />
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto overflow-x-auto pb-1 md:pb-0">
          <span className="text-xs font-semibold text-slate-400 flex items-center gap-1">
            <Filter className="w-3.5 h-3.5" /> Status:
          </span>
          {['ALL', 'CONFIRMED', 'COMPLETED', 'CANCELLED', 'RESCHEDULED'].map((st) => (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition whitespace-nowrap ${
                statusFilter === st
                  ? 'bg-indigo-600 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {st}
            </button>
          ))}
        </div>
      </div>

      {/* Table / Cards */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
        {filtered.length === 0 ? (
          <div className="text-center py-16 text-slate-400 text-sm">
            No appointments matching your filters.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/75 border-b border-slate-200 text-slate-500 text-[11px] font-bold uppercase tracking-wider">
                  <th className="py-3.5 px-4">Patient & Contact</th>
                  <th className="py-3.5 px-4">Doctor & Clinic</th>
                  <th className="py-3.5 px-4">Date & Time</th>
                  <th className="py-3.5 px-4">Status</th>
                  <th className="py-3.5 px-4">1-Hr Reminder</th>
                  <th className="py-3.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {filtered.map((appt) => (
                  <tr key={appt.id} className="hover:bg-slate-50/60 transition">
                    <td className="py-3.5 px-4">
                      <p className="font-bold text-slate-900">{appt.patient_name}</p>
                      <p className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
                        <Phone className="w-3 h-3 text-slate-400" /> {appt.mobile_number}
                      </p>
                    </td>

                    <td className="py-3.5 px-4">
                      <p className="font-semibold text-slate-800">{appt.doctor_name}</p>
                      <p className="text-xs text-slate-400 flex items-center gap-1 mt-0.5 truncate max-w-xs">
                        <MapPin className="w-3 h-3 text-slate-400 shrink-0" /> {appt.clinic_address}
                      </p>
                    </td>

                    <td className="py-3.5 px-4">
                      <p className="font-bold text-indigo-700 flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5" /> {appt.appointment_date}
                      </p>
                      <p className="text-xs font-semibold text-slate-600 flex items-center gap-1 mt-0.5">
                        <Clock className="w-3 h-3 text-slate-400" /> {appt.time_slot}
                      </p>
                    </td>

                    <td className="py-3.5 px-4">
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
                    </td>

                    <td className="py-3.5 px-4">
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
                    </td>

                    <td className="py-3.5 px-4 text-right space-x-1.5">
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
                              onClick={() => handleStatusChange(appt.id, 'CANCELLED')}
                              className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg transition inline-flex items-center border border-rose-200"
                              title="Cancel Appointment"
                            >
                              <XCircle className="w-4 h-4" />
                            </button>
                          )}
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
