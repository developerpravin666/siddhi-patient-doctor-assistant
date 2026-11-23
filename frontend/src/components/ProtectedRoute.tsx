import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
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
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }

  // 2. Role Authorization Check: Redirect to dedicated 401 Unauthorized page
  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return (
      <Navigate
        to="/unauthorized"
        state={{
          from: location.pathname,
          role: user.role,
          reason: 'role_forbidden',
          allowedRoles
        }}
        replace
      />
    );
  }

  // 3. Granular Screen & Action Permission Check (for Front Desk / Receptionist)
  if (requiredScreen && user.role === 'RECEPTIONIST') {
    const perms = user.permissions || {};
    const screenPerms = perms[requiredScreen] || {};
    const hasPermission = screenPerms[requiredAction] !== false;

    if (!hasPermission) {
      return (
        <Navigate
          to="/unauthorized"
          state={{
            from: location.pathname,
            role: user.role,
            screen: requiredScreen,
            action: requiredAction,
            reason: 'screen_forbidden'
          }}
          replace
        />
      );
    }
  }

  return <>{children}</>;
};
