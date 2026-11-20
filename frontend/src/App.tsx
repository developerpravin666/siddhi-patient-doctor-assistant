import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { MainLayout } from './components/MainLayout';
import { ProtectedRoute } from './components/ProtectedRoute';
import { LoginView } from './components/LoginView';
import { Dashboard } from './pages/Dashboard';
import { Appointments } from './pages/Appointments';
import { WhatsAppSimulator } from './pages/WhatsAppSimulator';
import { Doctors } from './pages/Doctors';
import { Patients } from './pages/Patients';
import { WhatsAppConfigPage } from './pages/WhatsAppConfig';
import { SettingsPage } from './pages/Settings';
import { TenantsManagement } from './pages/TenantsManagement';
import { UsersManagement } from './pages/UsersManagement';
import { UserForm } from './pages/UserForm';
import { AppointmentForm } from './pages/AppointmentForm';
import { DoctorForm } from './pages/DoctorForm';
import { PatientForm } from './pages/PatientForm';
import { SpecializationsManagement } from './pages/SpecializationsManagement';
import { TenantForm } from './pages/TenantForm';
import { getStoredUser } from './api/client';
import { ConfirmationProvider } from './context/ConfirmationContext';

/**
 * Role-aware root redirect component.
 * Directs Front Desk / Receptionist staff to live appointments queue,
 * and Super Admin / Clinic Admin to the main KPI dashboard.
 */
const RootRedirect: React.FC = () => {
  const user = getStoredUser();
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  if (user.role === 'RECEPTIONIST') {
    return <Navigate to="/appointments" replace />;
  }
  return <Navigate to="/dashboard" replace />;
};

/**
 * Main Application Routing Specification
 * Implements client-side routing, protected role-based layouts,
 * and granular screen permission checks adhering to CODING_STANDARDS.md.
 */
export const App: React.FC = () => {
  return (
    <BrowserRouter>
      <ConfirmationProvider>
        <Routes>
        {/* Public Authentication Route */}
        <Route path="/login" element={<LoginView />} />

        {/* Authenticated Application Routes wrapped in MainLayout */}
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <MainLayout />
            </ProtectedRoute>
          }
        >
          {/* Default Root Redirect */}
          <Route index element={<RootRedirect />} />

          {/* Core Routed Pages */}
          <Route
            path="dashboard"
            element={
              <ProtectedRoute allowedRoles={['SUPER_ADMIN', 'CLINIC_ADMIN']}>
                <Dashboard />
              </ProtectedRoute>
            }
          />

          <Route
            path="tenants"
            element={
              <ProtectedRoute allowedRoles={['SUPER_ADMIN']}>
                <TenantsManagement />
              </ProtectedRoute>
            }
          />

          <Route
            path="tenants/new"
            element={
              <ProtectedRoute allowedRoles={['SUPER_ADMIN']}>
                <TenantForm />
              </ProtectedRoute>
            }
          />

          <Route
            path="tenants/:id/edit"
            element={
              <ProtectedRoute allowedRoles={['SUPER_ADMIN']}>
                <TenantForm />
              </ProtectedRoute>
            }
          />

          <Route
            path="users"
            element={
              <ProtectedRoute allowedRoles={['SUPER_ADMIN', 'CLINIC_ADMIN']}>
                <UsersManagement />
              </ProtectedRoute>
            }
          />

          <Route
            path="users/new"
            element={
              <ProtectedRoute allowedRoles={['SUPER_ADMIN', 'CLINIC_ADMIN']}>
                <UserForm />
              </ProtectedRoute>
            }
          />

          <Route
            path="users/:id/edit"
            element={
              <ProtectedRoute allowedRoles={['SUPER_ADMIN', 'CLINIC_ADMIN']}>
                <UserForm />
              </ProtectedRoute>
            }
          />

          <Route
            path="appointments"
            element={
              <ProtectedRoute requiredScreen="appointments" requiredAction="view">
                <Appointments />
              </ProtectedRoute>
            }
          />

          <Route
            path="appointments/new"
            element={
              <ProtectedRoute requiredScreen="appointments" requiredAction="create">
                <AppointmentForm />
              </ProtectedRoute>
            }
          />

          <Route
            path="appointments/:id/edit"
            element={
              <ProtectedRoute requiredScreen="appointments" requiredAction="edit">
                <AppointmentForm />
              </ProtectedRoute>
            }
          />

          <Route
            path="simulator"
            element={
              <ProtectedRoute requiredScreen="simulator" requiredAction="view">
                <WhatsAppSimulator />
              </ProtectedRoute>
            }
          />

          <Route
            path="doctors"
            element={
              <ProtectedRoute requiredScreen="doctors" requiredAction="view">
                <Doctors />
              </ProtectedRoute>
            }
          />

          <Route
            path="doctors/new"
            element={
              <ProtectedRoute requiredScreen="doctors" requiredAction="create">
                <DoctorForm />
              </ProtectedRoute>
            }
          />

          <Route
            path="doctors/:id/edit"
            element={
              <ProtectedRoute requiredScreen="doctors" requiredAction="edit">
                <DoctorForm />
              </ProtectedRoute>
            }
          />

          <Route
            path="specializations"
            element={
              <ProtectedRoute allowedRoles={['SUPER_ADMIN', 'CLINIC_ADMIN']}>
                <SpecializationsManagement />
              </ProtectedRoute>
            }
          />

          <Route
            path="patients"
            element={
              <ProtectedRoute requiredScreen="patients" requiredAction="view">
                <Patients />
              </ProtectedRoute>
            }
          />

          <Route
            path="patients/new"
            element={
              <ProtectedRoute requiredScreen="patients" requiredAction="create">
                <PatientForm />
              </ProtectedRoute>
            }
          />

          <Route
            path="patients/:id/edit"
            element={
              <ProtectedRoute requiredScreen="patients" requiredAction="edit">
                <PatientForm />
              </ProtectedRoute>
            }
          />

          <Route
            path="whatsapp-config"
            element={
              <ProtectedRoute allowedRoles={['SUPER_ADMIN', 'CLINIC_ADMIN']}>
                <WhatsAppConfigPage />
              </ProtectedRoute>
            }
          />

          <Route
            path="settings"
            element={
              <ProtectedRoute allowedRoles={['SUPER_ADMIN', 'CLINIC_ADMIN']}>
                <SettingsPage />
              </ProtectedRoute>
            }
          />
        </Route>

        {/* Fallback Catch-All Route */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </ConfirmationProvider>
  </BrowserRouter>
);
};

export default App;
