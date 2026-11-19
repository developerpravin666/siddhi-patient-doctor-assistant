import React, { useState, useEffect } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
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

  // Verify token freshness on mount
  useEffect(() => {
    const checkAuth = async () => {
      const stored = getStoredUser();
      if (!stored) {
        navigate('/login', { replace: true });
        return;
      }
      try {
        const freshUser = await getMe();
        setCurrentUser(freshUser);
      } catch {
        logoutApi();
        setCurrentUser(null);
        navigate('/login', { replace: true });
      }
    };
    checkAuth();
  }, [navigate]);

  const loadData = async () => {
    if (!currentUser) return;
    try {
      const [sData, aData, dData, cData, pData] = await Promise.allSettled([
        getDashboardStats(),
        getAppointments(),
        getDoctors(),
        getClinics(),
        getPatients()
      ]);

      if (sData.status === 'fulfilled') setStats(sData.value);
      if (aData.status === 'fulfilled') setAppointments(aData.value);
      if (dData.status === 'fulfilled') setDoctors(dData.value);
      if (cData.status === 'fulfilled') setClinics(cData.value);
      if (pData.status === 'fulfilled') setPatients(pData.value);
    } catch (err) {
      console.error("Failed to load layout data", err);
    }
  };

  useEffect(() => {
    if (currentUser) {
      loadData();
      const interval = setInterval(loadData, 15000);
      return () => clearInterval(interval);
    }
  }, [currentUser?.id, currentUser?.tenant_id]);

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
