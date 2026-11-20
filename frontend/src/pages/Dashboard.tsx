import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Calendar, 
  CheckCircle2, 
  Clock, 
  Users, 
  ArrowUpRight, 
  Sparkles, 
  ShieldCheck,
  ChevronRight,
  MessageSquare,
  RefreshCw,
  AlertCircle
} from 'lucide-react';
import { DashboardStats, Appointment } from '../types';
import { getDashboardStats, getAppointments } from '../api/client';

interface DashboardProps {
  stats?: DashboardStats;
  recentAppointments?: Appointment[];
  onNavigate?: (tab: any) => void;
  onRefresh?: () => void;
}

export const Dashboard: React.FC<DashboardProps> = (props) => {
  const navigate = useNavigate();

  const [stats, setStats] = useState<DashboardStats>(props.stats || {
    total_appointments: 0,
    today_appointments: 0,
    confirmed_appointments: 0,
    cancelled_appointments: 0,
    total_patients: 0,
    total_doctors: 0,
    pending_reminders: 0
  });
  const [recentAppointments, setRecentAppointments] = useState<Appointment[]>(props.recentAppointments || []);
  const [loading, setLoading] = useState<boolean>(!props.stats);
  const [error, setError] = useState<string | null>(null);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      setError(null);
      const [statsData, apptsData] = await Promise.all([
        getDashboardStats(),
        getAppointments()
      ]);
      setStats(statsData);
      setRecentAppointments(apptsData);
    } catch (err: any) {
      console.error('Failed to load dashboard data:', err);
      setError(err.response?.data?.detail || 'Failed to load dashboard data. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!props.stats) {
      fetchDashboardData();
    }
  }, [props.stats]);

  const handleNavigate = (path: string) => {
    if (props.onNavigate) {
      props.onNavigate(path);
    } else {
      navigate(path.startsWith('/') ? path : `/${path}`);
    }
  };

  const handleRefresh = () => {
    if (props.onRefresh) {
      props.onRefresh();
    } else {
      fetchDashboardData();
    }
  };
  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-gradient-to-r from-brand-700 via-brand-600 to-emerald-600 rounded-2xl p-6 text-white shadow-lg shadow-brand-700/15 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/20 text-xs font-semibold backdrop-blur-sm mb-2">
            <Sparkles className="w-3.5 h-3.5 text-emerald-200" />
            Meta WhatsApp Receptionist Online
          </div>
          <h2 className="text-2xl font-bold tracking-tight">AI Receptionist Live Control Panel</h2>
          <p className="text-brand-100 text-sm max-w-xl mt-1">
            Automating multi-tenant clinic bookings via Gemini Function Calling, WhatsApp Cloud Webhook, and 1-hour automated reminders.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => handleNavigate('/simulator')}
            className="px-4 py-2.5 rounded-xl bg-white text-brand-700 font-bold text-sm hover:bg-brand-50 transition shadow-md flex items-center gap-2"
          >
            <MessageSquare className="w-4 h-4 text-brand-600" /> Test WhatsApp Simulator
          </button>
          <button
            onClick={handleRefresh}
            disabled={loading}
            className="px-3.5 py-2.5 rounded-xl bg-brand-800/60 text-white font-medium text-sm hover:bg-brand-800 transition flex items-center gap-1.5 disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Error Alert */}
      {error && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-sm flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{error}</span>
          </div>
          <button onClick={fetchDashboardData} className="text-xs font-bold underline hover:text-rose-900">
            Retry
          </button>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-sm hover:shadow-md transition">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Today's Appointments</span>
            <div className="w-9 h-9 rounded-xl bg-brand-50 text-brand-600 flex items-center justify-center">
              <Calendar className="w-5 h-5" />
            </div>
          </div>
          <p className="text-3xl font-extrabold text-slate-900 mt-3">{stats.today_appointments}</p>
          <div className="flex items-center gap-1.5 mt-2 text-xs text-brand-600 font-semibold">
            <ArrowUpRight className="w-3.5 h-3.5" />
            <span>Scheduled for today</span>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-sm hover:shadow-md transition">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Confirmed Bookings</span>
            <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <CheckCircle2 className="w-5 h-5" />
            </div>
          </div>
          <p className="text-3xl font-extrabold text-emerald-700 mt-3">{stats.confirmed_appointments}</p>
          <div className="flex items-center gap-1.5 mt-2 text-xs text-slate-500">
            <span>Out of {stats.total_appointments} total created</span>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-sm hover:shadow-md transition">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">1-Hour Reminders</span>
            <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
              <Clock className="w-5 h-5" />
            </div>
          </div>
          <p className="text-3xl font-extrabold text-amber-600 mt-3">{stats.pending_reminders}</p>
          <div className="flex items-center gap-1.5 mt-2 text-xs text-amber-600 font-medium">
            <span>Automated WhatsApp template queue</span>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-sm hover:shadow-md transition">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Registered Patients</span>
            <div className="w-9 h-9 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center">
              <Users className="w-5 h-5" />
            </div>
          </div>
          <p className="text-3xl font-extrabold text-slate-900 mt-3">{stats.total_patients}</p>
          <div className="flex items-center gap-1.5 mt-2 text-xs text-sky-600 font-medium">
            <span>{stats.total_doctors} Doctor(s) on duty</span>
          </div>
        </div>
      </div>

      {/* Middle Grid: Safety Guardrails & Recent Bookings */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Safety Protocol Status */}
        <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h3 className="font-bold text-slate-900 flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-emerald-600" /> Medical Guardrails Status
            </h3>
            <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800">
              Enforced
            </span>
          </div>

          <div className="space-y-3 text-xs">
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-100">
              <p className="font-bold text-rose-900">Emergency Protocol (4.1)</p>
              <p className="text-rose-700 mt-0.5">
                Automatic deflection for chest pain, stroke, heavy bleeding, suicidal thoughts to 112/108/911.
              </p>
            </div>

            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
              <p className="font-bold text-slate-800">Strict 5-Step Booking (2.0)</p>
              <p className="text-slate-600 mt-0.5">
                Name → 10-Digit Mobile → 3-5 Numbered Slots → DB Save → Final Details Confirmation.
              </p>
            </div>

            <div className="p-3 rounded-xl bg-amber-50 border border-amber-100">
              <p className="font-bold text-amber-900">Automated 1-Hour Reminder (6.0)</p>
              <p className="text-amber-800 mt-0.5">
                Background worker scans every 60s for appointments 58-62m ahead and fires WhatsApp template.
              </p>
            </div>
          </div>
        </div>

        {/* Right 2 Columns: Recent Appointments Feed */}
        <div className="lg:col-span-2 bg-white rounded-2xl p-6 border border-slate-200/80 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h3 className="font-bold text-slate-900">Recent Appointments</h3>
              <p className="text-xs text-slate-500">Live feed of WhatsApp bookings</p>
            </div>
            <button
              onClick={() => handleNavigate('/appointments')}
              className="text-xs font-bold text-brand-600 hover:text-brand-700 flex items-center gap-1"
            >
              View All <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {recentAppointments.length === 0 ? (
            <div className="text-center py-10 text-slate-400 text-sm">
              No appointments booked yet. Open the WhatsApp Simulator to test!
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {recentAppointments.slice(0, 5).map((appt) => (
                <div key={appt.id} className="py-3 flex items-center justify-between">
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <p className="font-bold text-sm text-slate-800">{appt.patient_name}</p>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        appt.status === 'CONFIRMED'
                          ? 'bg-emerald-100 text-emerald-800'
                          : appt.status === 'CANCELLED'
                          ? 'bg-rose-100 text-rose-800'
                          : 'bg-slate-100 text-slate-700'
                      }`}>
                        {appt.status}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500">
                      📱 {appt.mobile_number} • Dr: {appt.doctor_name}
                    </p>
                  </div>

                  <div className="text-right">
                    <p className="text-xs font-bold text-brand-700">{appt.appointment_date}</p>
                    <p className="text-xs font-semibold text-slate-600">{appt.time_slot}</p>
                    {appt.reminder_sent && (
                      <span className="text-[10px] font-medium text-emerald-600">✓ Reminder Sent</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
