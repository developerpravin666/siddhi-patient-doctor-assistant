import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { 
  Calendar, 
  Plus, 
  Filter, 
  CheckCircle, 
  XCircle, 
  Clock, 
  MapPin, 
  Phone, 
  Edit3, 
  RefreshCw, 
  AlertCircle,
  CalendarDays
} from 'lucide-react';
import { useOutletContext, useNavigate } from 'react-router-dom';
import { Appointment, UserRole, AdminUser, AppContextType } from '../types';
import { getAppointments, updateAppointmentStatus } from '../api/client';
import { DataTable, ColumnDef } from '../components/DataTable';
import { useConfirm } from '../context/ConfirmationContext';

interface AppointmentsProps {
  appointments?: Appointment[];
  onRefresh?: () => void;
  currentUser?: AdminUser | null;
  userRole?: UserRole;
  defaultMode?: 'server' | 'client';
}

const getTodayStr = (): string => {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const getTomorrowStr = (): string => {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const getWeekRange = (): { start: string; end: string } => {
  const now = new Date();
  const dayOfWeek = now.getDay(); // 0 is Sunday
  const start = new Date(now);
  start.setDate(now.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1)); // Monday
  const end = new Date(start);
  end.setDate(start.getDate() + 6); // Sunday

  const formatDate = (d: Date) => {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  return { start: formatDate(start), end: formatDate(end) };
};

export const Appointments: React.FC<AppointmentsProps> = (props) => {
  const navigate = useNavigate();
  const outlet = useOutletContext<AppContextType>();

  // Mode: server (default) or client
  const [gridMode] = useState<'server' | 'client'>(props.defaultMode || 'server');

  // Date range filter: DEFAULT TO TODAY'S APPOINTMENTS
  const todayStr = useMemo(() => getTodayStr(), []);
  const [fromDate, setFromDate] = useState<string>(todayStr);
  const [toDate, setToDate] = useState<string>(todayStr);

  // Status & Search & Sorting & Pagination state
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [sortKey, setSortKey] = useState<string | null>('appointment_date');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(10);
  const [totalCount, setTotalCount] = useState<number>(0);

  const [appointmentsList, setAppointmentsList] = useState<Appointment[]>(props.appointments || []);
  const [loading, setLoading] = useState<boolean>(!props.appointments);
  const [error, setError] = useState<string | null>(null);

  const appointments = props.appointments || appointmentsList;
  const currentUser = props.currentUser !== undefined ? props.currentUser : outlet?.currentUser;
  const userRole = props.userRole || outlet?.userRole || 'RECEPTIONIST';

  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const confirm = useConfirm();

  // Fetch appointments from backend with parameters
  const fetchAppointments = useCallback(async (overrides?: {
    fromDate?: string;
    toDate?: string;
    statusFilter?: string;
    search?: string;
    sortKey?: string | null;
    sortDir?: 'asc' | 'desc';
    page?: number;
    pageSize?: number;
    mode?: 'server' | 'client';
  }) => {
    try {
      setLoading(true);
      setError(null);

      const effMode = overrides?.mode || gridMode;
      const effFromDate = overrides?.fromDate !== undefined ? overrides.fromDate : fromDate;
      const effToDate = overrides?.toDate !== undefined ? overrides.toDate : toDate;
      const effStatus = overrides?.statusFilter !== undefined ? overrides.statusFilter : statusFilter;
      const effSearch = overrides?.search !== undefined ? overrides.search : searchTerm;
      const effSortKey = overrides?.sortKey !== undefined ? overrides.sortKey : sortKey;
      const effSortDir = overrides?.sortDir !== undefined ? overrides.sortDir : sortDir;
      const effPage = overrides?.page !== undefined ? overrides.page : page;
      const effPageSize = overrides?.pageSize !== undefined ? overrides.pageSize : pageSize;

      const params: any = {};
      if (effFromDate) params.from_date = effFromDate;
      if (effToDate) params.to_date = effToDate;
      if (effStatus && effStatus !== 'ALL') params.status = effStatus;

      if (effMode === 'server') {
        if (effSearch) params.search = effSearch;
        if (effSortKey) params.sort_by = effSortKey;
        if (effSortDir) params.sort_dir = effSortDir;
        params.page = effPage;
        params.page_size = effPageSize;
      }

      const data = await getAppointments(params);
      setAppointmentsList(data);
      setTotalCount((data as any).total ?? data.length);
    } catch (err: any) {
      console.error('Failed to load appointments:', err);
      setError(err.response?.data?.detail || 'Failed to load appointments');
    } finally {
      setLoading(false);
    }
  }, [gridMode, fromDate, toDate, statusFilter, searchTerm, sortKey, sortDir, page, pageSize]);

  // Initial load on mount or when dates/status changes
  useEffect(() => {
    if (!props.appointments) {
      fetchAppointments();
    }
  }, [fromDate, toDate, statusFilter, gridMode]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleRefresh = () => {
    if (props.onRefresh) {
      props.onRefresh();
    } else {
      fetchAppointments();
    }
  };

  // Quick Date Range Selectors
  const handleDatePreset = (preset: 'today' | 'tomorrow' | 'week' | 'all') => {
    setPage(1);
    if (preset === 'today') {
      const today = getTodayStr();
      setFromDate(today);
      setToDate(today);
      fetchAppointments({ fromDate: today, toDate: today, page: 1 });
    } else if (preset === 'tomorrow') {
      const tmrw = getTomorrowStr();
      setFromDate(tmrw);
      setToDate(tmrw);
      fetchAppointments({ fromDate: tmrw, toDate: tmrw, page: 1 });
    } else if (preset === 'week') {
      const { start, end } = getWeekRange();
      setFromDate(start);
      setToDate(end);
      fetchAppointments({ fromDate: start, toDate: end, page: 1 });
    } else if (preset === 'all') {
      setFromDate('');
      setToDate('');
      fetchAppointments({ fromDate: '', toDate: '', page: 1 });
    }
  };

  // Server-side parameters change from DataTable
  const handleDataTableParamsChange = (params: {
    page: number;
    pageSize: number;
    sortKey: string | null;
    sortDir: 'asc' | 'desc';
    search: string;
  }) => {
    setPage(params.page);
    setPageSize(params.pageSize);
    setSortKey(params.sortKey);
    setSortDir(params.sortDir);
    setSearchTerm(params.search);

    if (gridMode === 'server') {
      fetchAppointments({
        page: params.page,
        pageSize: params.pageSize,
        sortKey: params.sortKey,
        sortDir: params.sortDir,
        search: params.search,
      });
    }
  };

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
      handleRefresh();
    } catch (err: any) {
      showToast(err.response?.data?.detail || 'Failed to update appointment status', 'error');
    }
  };

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
            <MapPin className="w-3 h-3 text-slate-400 shrink-0" />
            <span className="truncate">{appt.clinic_address || appt.clinic_name}</span>
          </p>
        </div>
      )
    },
    {
      key: 'appointment_date',
      header: 'Date & Time Slot',
      sortable: true,
      sortValue: (appt: Appointment) => appt.appointment_datetime,
      searchValue: (appt: Appointment) => `${appt.appointment_date} ${appt.time_slot}`,
      render: (appt: Appointment) => {
        const isToday = appt.appointment_date === todayStr;
        return (
          <div>
            <div className="flex items-center gap-1.5 font-bold text-brand-700">
              <Calendar className="w-3.5 h-3.5" />
              <span>{appt.appointment_date}</span>
              {isToday && (
                <span className="px-1.5 py-0.2 bg-emerald-100 text-emerald-800 text-[9px] font-bold rounded-md">
                  Today
                </span>
              )}
            </div>
            <p className="text-xs font-semibold text-slate-600 flex items-center gap-1 mt-0.5">
              <Clock className="w-3 h-3 text-slate-400" /> {appt.time_slot}
            </p>
          </div>
        );
      }
    },
    {
      key: 'status',
      header: 'Status',
      sortable: true,
      sortValue: (appt: Appointment) => appt.status,
      searchValue: (appt: Appointment) => appt.status,
      render: (appt: Appointment) => {
        const statusColors: Record<string, string> = {
          CONFIRMED: 'bg-emerald-100 text-emerald-800 border-emerald-200',
          COMPLETED: 'bg-blue-100 text-blue-800 border-blue-200',
          CANCELLED: 'bg-rose-100 text-rose-800 border-rose-200',
          RESCHEDULED: 'bg-amber-100 text-amber-800 border-amber-200',
        };
        return (
          <span className={`px-2.5 py-1 rounded-full text-xs font-bold border ${statusColors[appt.status] || 'bg-slate-100 text-slate-700'}`}>
            {appt.status}
          </span>
        );
      }
    },
    {
      key: 'reminder_sent',
      header: '1h Alert',
      sortable: true,
      sortValue: (appt: Appointment) => appt.reminder_sent ? 1 : 0,
      render: (appt: Appointment) => (
        appt.reminder_sent ? (
          <span className="inline-flex items-center gap-1 text-emerald-600 font-bold text-xs">
            <CheckCircle className="w-3.5 h-3.5" /> Sent
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-slate-400 text-xs">
            <Clock className="w-3.5 h-3.5" /> Pending
          </span>
        )
      )
    },
    {
      key: 'actions',
      header: 'Actions',
      sortable: false,
      align: 'right',
      render: (appt: Appointment) => (
        <div className="flex items-center justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
          {canEdit && (
            <button
              onClick={() => navigate(`/appointments/${appt.id}/edit`)}
              className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 hover:text-indigo-600 transition"
              title="Edit Appointment"
            >
              <Edit3 className="w-3.5 h-3.5" />
            </button>
          )}

          {appt.status !== 'CANCELLED' && appt.status !== 'COMPLETED' && (
            <>
              {canEdit && (
                <button
                  onClick={() => handleStatusChange(appt.id, 'COMPLETED')}
                  className="p-1.5 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 transition"
                  title="Mark as Completed"
                >
                  <CheckCircle className="w-3.5 h-3.5" />
                </button>
              )}

              {canDelete && (
                <button
                  onClick={() => handleStatusChange(appt.id, 'CANCELLED', appt.patient_name)}
                  className="p-1.5 rounded-lg bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200 transition"
                  title="Cancel Appointment"
                >
                  <XCircle className="w-3.5 h-3.5" />
                </button>
              )}
            </>
          )}
        </div>
      )
    }
  ], [canEdit, canDelete, navigate, todayStr]);

  const isTodayFiltered = fromDate === todayStr && toDate === todayStr;

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

      {/* Error Alert */}
      {error && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-sm flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{error}</span>
          </div>
          <button onClick={() => fetchAppointments()} className="text-xs font-bold underline hover:text-rose-900">
            Retry
          </button>
        </div>
      )}

      {/* Date Range & Filter Toolbar */}
      <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-sm flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5 mr-1">
            <CalendarDays className="w-4 h-4 text-indigo-600" />
            Filter Appointments Date:
          </span>

          <div className="inline-flex rounded-xl p-0.5 bg-slate-100 border border-slate-200 text-xs">
            <button
              onClick={() => handleDatePreset('today')}
              className={`px-3 py-1.5 rounded-lg font-bold transition ${
                isTodayFiltered ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Today
            </button>
            <button
              onClick={() => handleDatePreset('tomorrow')}
              className={`px-3 py-1.5 rounded-lg font-bold transition ${
                fromDate === getTomorrowStr() && toDate === getTomorrowStr()
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Tomorrow
            </button>
            <button
              onClick={() => handleDatePreset('week')}
              className={`px-3 py-1.5 rounded-lg font-bold transition ${
                fromDate === getWeekRange().start && toDate === getWeekRange().end
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              This Week
            </button>
            <button
              onClick={() => handleDatePreset('all')}
              className={`px-3 py-1.5 rounded-lg font-bold transition ${
                !fromDate && !toDate ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              All Dates
            </button>
          </div>
        </div>

        {/* Custom From Date to To Date Inputs */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <div className="flex items-center gap-1.5 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200">
            <span className="text-slate-500 font-medium">From:</span>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => {
                setFromDate(e.target.value);
                setPage(1);
              }}
              className="bg-transparent text-slate-800 font-semibold focus:outline-none"
            />
          </div>

          <div className="flex items-center gap-1.5 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200">
            <span className="text-slate-500 font-medium">To:</span>
            <input
              type="date"
              value={toDate}
              onChange={(e) => {
                setToDate(e.target.value);
                setPage(1);
              }}
              className="bg-transparent text-slate-800 font-semibold focus:outline-none"
            />
          </div>
        </div>
      </div>

      {/* DataTable with Server/Client Mode, Search, Sort, Pagination & Status Filter */}
      <DataTable<Appointment>
        title={
          <div className="flex items-center gap-2">
            <span>{userRole === 'RECEPTIONIST' ? 'Front Desk Live Appointments Queue' : 'Appointments Management'}</span>
            {isTodayFiltered && (
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                Today's Queue ({totalCount})
              </span>
            )}
          </div>
        }
        subtitle={
          isTodayFiltered
            ? `Viewing appointments scheduled for today (${todayStr})`
            : fromDate && toDate
            ? `Showing appointments scheduled from ${fromDate} to ${toDate}`
            : 'Viewing all appointments across dates'
        }
        data={appointments}
        columns={columns}
        keyExtractor={(a) => a.id}
        loading={loading}
        searchPlaceholder="Search patient name, doctor, or mobile..."
        mode={gridMode}
        totalCount={totalCount}
        page={page}
        pageSize={pageSize}
        sortKey={sortKey}
        sortDir={sortDir}
        searchTerm={searchTerm}
        onParamsChange={handleDataTableParamsChange}
        extraFilters={
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs font-semibold text-slate-400 flex items-center gap-1 mr-1">
              <Filter className="w-3.5 h-3.5" /> Status:
            </span>
            {['ALL', 'CONFIRMED', 'COMPLETED', 'CANCELLED', 'RESCHEDULED'].map((st) => (
              <button
                key={st}
                onClick={() => {
                  setStatusFilter(st);
                  setPage(1);
                  fetchAppointments({ statusFilter: st, page: 1 });
                }}
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
          <div className="flex items-center gap-2">
            <button
              onClick={handleRefresh}
              disabled={loading}
              className="p-2.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 transition disabled:opacity-50"
              title="Refresh Appointments"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-indigo-600' : ''}`} />
            </button>
            {canCreate && (
              <button
                onClick={() => navigate('/appointments/new')}
                className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm transition shadow-sm flex items-center gap-2"
              >
                <Plus className="w-4 h-4" /> Book Patient Appointment
              </button>
            )}
          </div>
        }
        emptyMessage={
          isTodayFiltered
            ? "No appointments booked for today. Use the date picker above to view other dates or book a new appointment."
            : "No appointments found matching your filters and date range."
        }
        defaultPageSize={10}
        initialSortKey="appointment_date"
        initialSortDir="desc"
      />
    </div>
  );
};
