import React, { useState, useEffect } from 'react';
import { Navbar } from './components/Navbar';
import { Sidebar, NavTab } from './components/Sidebar';
import { Dashboard } from './pages/Dashboard';
import { Appointments } from './pages/Appointments';
import { WhatsAppSimulator } from './pages/WhatsAppSimulator';
import { Doctors } from './pages/Doctors';
import { Patients } from './pages/Patients';
import { SettingsPage } from './pages/Settings';
import { 
  getDashboardStats, 
  getAppointments, 
  getDoctors, 
  getClinics, 
  getPatients 
} from './api/client';
import { DashboardStats, Appointment, Doctor, Clinic, Patient } from './types';

export const App: React.FC = () => {
  const [currentTab, setCurrentTab] = useState<NavTab>('dashboard');
  const [stats, setStats] = useState<DashboardStats>({
    total_appointments: 0,
    today_appointments: 0,
    confirmed_appointments: 0,
    cancelled_appointments: 0,
    total_patients: 0,
    total_doctors: 1,
    pending_reminders: 0
  });
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [clinics, setClinics] = useState<Clinic[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);

  const loadData = async () => {
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
      console.error("Failed to load initial data", err);
    }
  };

  useEffect(() => {
    loadData();
    // Poll data periodically every 15s to catch simulator bookings
    const interval = setInterval(loadData, 15000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <Navbar clinicName={clinics[0]?.name} />

      <div className="flex-1 flex flex-row">
        <Sidebar 
          currentTab={currentTab} 
          onSelectTab={setCurrentTab} 
          pendingRemindersCount={stats.pending_reminders} 
        />

        <main className="flex-1 p-6 max-w-7xl mx-auto w-full">
          {currentTab === 'dashboard' && (
            <Dashboard
              stats={stats}
              recentAppointments={appointments}
              onNavigate={setCurrentTab}
              onRefresh={loadData}
            />
          )}

          {currentTab === 'appointments' && (
            <Appointments
              appointments={appointments}
              onRefresh={loadData}
            />
          )}

          {currentTab === 'simulator' && (
            <WhatsAppSimulator />
          )}

          {currentTab === 'doctors' && (
            <Doctors doctors={doctors} />
          )}

          {currentTab === 'patients' && (
            <Patients patients={patients} />
          )}

          {currentTab === 'settings' && (
            <SettingsPage clinic={clinics[0]} />
          )}
        </main>
      </div>
    </div>
  );
};

export default App;
