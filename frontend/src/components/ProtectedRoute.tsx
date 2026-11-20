import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { ShieldAlert } from 'lucide-react';
import { AdminUser, UserRole } from '../types';
import { getStoredUser } from '../api/client';

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles?: UserRole[];
  requiredScreen?: string;
  requiredAction?: 'view' | 'create' | 'edit' | 'delete';
  currentUser?: AdminUser | null;
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({
  children,
  allowedRoles,
  requiredScreen,
  requiredAction = 'view',
  currentUser
}) => {
  const location = useLocation();
  const user = currentUser || getStoredUser();

  // 1. Authentication Check
  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // 2. Role Authorization Check
  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return (
      <div className="p-8 max-w-2xl mx-auto my-12 bg-white rounded-3xl border border-rose-200 shadow-xl space-y-4 text-center">
        <div className="w-14 h-14 bg-rose-100 text-rose-600 rounded-2xl flex items-center justify-center mx-auto">
          <ShieldAlert className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-bold text-slate-900">Access Denied (403 Forbidden)</h2>
        <p className="text-sm text-slate-600">
          Your role (<span className="font-semibold text-rose-600">{user.role}</span>) does not have authorization to access this page.
        </p>
        <div className="pt-2">
          <a
            href="/dashboard"
            className="inline-block px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl transition"
          >
            Return to Dashboard
          </a>
        </div>
      </div>
    );
  }

  // 3. Granular Screen & Action Permission Check (for Front Desk / Receptionist)
  if (requiredScreen && user.role === 'RECEPTIONIST') {
    const perms = user.permissions || {};
    const screenPerms = perms[requiredScreen] || {};
    const hasPermission = screenPerms[requiredAction] !== false;

    if (!hasPermission) {
      return (
        <div className="p-8 max-w-2xl mx-auto my-12 bg-white rounded-3xl border border-amber-200 shadow-xl space-y-4 text-center">
          <div className="w-14 h-14 bg-amber-100 text-amber-600 rounded-2xl flex items-center justify-center mx-auto">
            <ShieldAlert className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-bold text-slate-900">Permission Restricted</h2>
          <p className="text-sm text-slate-600">
            You do not have permission to <span className="font-semibold text-amber-700">{requiredAction}</span> on{' '}
            <span className="font-semibold text-amber-700">{requiredScreen}</span>.
          </p>
          <p className="text-xs text-slate-400">
            Please contact your Doctor / Clinic Admin to request permission.
          </p>
        </div>
      );
    }
  }

  return <>{children}</>;
};
