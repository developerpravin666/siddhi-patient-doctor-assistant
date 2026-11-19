import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { Navbar } from './Navbar';
import { Sidebar } from './Sidebar';
import { 
  getDashboardStats, 
  getAppointments, 
  getDoctors, 
  getClinics, 
  getPatients,
  getStoredUser,
  logoutApi,
  getMe
} from '../api/client';
import { DashboardStats, Appointment, Doctor, Clinic, Patient, AdminUser, AppContextType } from '../types';

export const MainLayout: React.FC = () => {
  const navigate = useNavigate();
  const [currentUser, setCurrentUser] = useState<AdminUser | null>(() => getStoredUser());
  const [stats, setStats] = useState<DashboardStats>({
    total_appointments: 0,
    today_appointments: 0,
    confirmed_appointments: 0,
    cancelled_appointments: 0,
    total_patients: 0,
    total_doctors: 0,
    pending_reminders: 0
  });
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [clinics, setClinics] = useState<Clinic[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);

  const location = useLocation();
  const currentPathRef = useRef<string>('');
  const isLoadingRef = useRef(false);
  const authCheckedRef = useRef(false);

  const loadData = useCallback(async (targetPath?: string) => {
    if (isLoadingRef.current) return;
    isLoadingRef.current = true;
    try {
      const path = (targetPath || location.pathname || '').toLowerCase();
      const promises: Promise<any>[] = [];

      if (path.includes('patient')) {
        promises.push(getPatients().then(setPatients));
      } else if (path.includes('doctor')) {
        promises.push(getDoctors().then(setDoctors));
      } else if (path.includes('appointment')) {
        promises.push(getAppointments().then(setAppointments));
        promises.push(getDoctors().then(setDoctors));
      } else if (path.includes('dashboard') || path === '/' || path === '') {
        promises.push(getDashboardStats().then(setStats));
        promises.push(getAppointments().then(setAppointments));
      } else if (path.includes('whatsapp') || path.includes('setting')) {
        promises.push(getClinics().then(setClinics));
        promises.push(getDoctors().then(setDoctors));
      } else if (
        path.includes('specialization') ||
        path.includes('user') ||
        path.includes('tenant')
      ) {
        // Dedicated master screens manage their own lifecycle.
        // Do not fire any layout fallback calls.
      } else if (targetPath === '__full__') {
        // Explicit full layout refresh
        promises.push(
          getDashboardStats().then(setStats),
          getAppointments().then(setAppointments),
          getDoctors().then(setDoctors),
          getClinics().then(setClinics),
          getPatients().then(setPatients)
        );
      }

      await Promise.allSettled(promises);
    } catch (err) {
      console.error('Failed to load data for route:', err);
    } finally {
      isLoadingRef.current = false;
    }
  }, [location.pathname]);

  // Fetch route-specific data ONCE whenever switching between routes
  useEffect(() => {
    // Only execute when the route pathname actually changes
    if (currentPathRef.current === location.pathname) return;
    currentPathRef.current = location.pathname;

    const stored = getStoredUser();
    if (!stored) {
      navigate('/login', { replace: true });
      return;
    }

    loadData(location.pathname);
  }, [location.pathname, navigate, loadData]);

  // Background auth token verification once on mount
  useEffect(() => {
    if (authCheckedRef.current) return;
    authCheckedRef.current = true;

    const stored = getStoredUser();
    if (!stored) return;

    getMe()
      .then((freshUser) => {
        setCurrentUser(freshUser);
        localStorage.setItem('siddhi_user', JSON.stringify(freshUser));
      })
      .catch(() => {
        logoutApi();
        setCurrentUser(null);
        navigate('/login', { replace: true });
      });
  }, [navigate]);

  const handleLogout = () => {
    logoutApi();
    setCurrentUser(null);
    navigate('/login', { replace: true });
  };

  const contextValue: AppContextType = {
    currentUser,
    userRole: currentUser?.role || 'RECEPTIONIST',
    stats,
    appointments,
    doctors,
    clinics,
    patients,
    loadData,
    handleLogout
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <Navbar 
        clinicName={clinics[0]?.name} 
        currentUser={currentUser}
        onLogout={handleLogout}
      />

      <div className="flex-1 flex flex-row">
        <Sidebar 
          pendingRemindersCount={stats.pending_reminders}
          currentUser={currentUser}
          userRole={currentUser?.role}
        />

        <main className="flex-1 p-6 max-w-7xl mx-auto w-full">
          <Outlet context={contextValue} />
        </main>
      </div>
    </div>
  );
};
