import React from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { ShieldAlert, ArrowLeft, Home, LogOut, LockKeyhole } from 'lucide-react';
import { getStoredUser, logoutApi } from '../api/client';

export const UnauthorizedPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const user = getStoredUser();

  // Extract navigation metadata if provided by ProtectedRoute
  const state = location.state as { from?: string; role?: string; reason?: string; screen?: string } | null;
  const attemptedPath = state?.from || location.pathname;

  // Determine user's primary landing home route based on role
  const getHomeRoute = (): string => {
    if (!user) return '/login';
    if (user.role === 'RECEPTIONIST') return '/appointments';
    return '/dashboard';
  };

  const getHomeLabel = (): string => {
    if (!user) return 'Sign In';
    if (user.role === 'RECEPTIONIST') return 'Return to Appointments Queue';
    return 'Return to Dashboard';
  };

  const handleLogout = () => {
    logoutApi();
    navigate('/login', { replace: true });
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 text-center">
      <div className="max-w-md w-full bg-white rounded-3xl p-8 border border-slate-200/80 shadow-xl shadow-slate-200/50 space-y-6">
        {/* Warning Icon Badge */}
        <div className="w-16 h-16 bg-rose-50 border border-rose-100 text-rose-600 rounded-2xl flex items-center justify-center mx-auto shadow-sm">
          <ShieldAlert className="w-9 h-9" />
        </div>

        {/* Status & Title */}
        <div className="space-y-2">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-rose-100 text-rose-800">
            <LockKeyhole className="w-3.5 h-3.5" /> 401 &bull; Access Denied
          </span>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">
            Unauthorized Access
          </h1>
          <p className="text-sm text-slate-500 leading-relaxed">
            You do not have permission to view or manage the requested resource{' '}
            {attemptedPath && attemptedPath !== '/unauthorized' && (
              <code className="text-xs font-mono font-bold bg-slate-100 px-1.5 py-0.5 rounded text-slate-700">
                {attemptedPath}
              </code>
            )}.
          </p>
        </div>

        {/* User Context Card */}
        {user ? (
          <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200/60 text-left space-y-1.5 text-xs">
            <div className="flex justify-between items-center">
              <span className="text-slate-400 font-medium">Signed In As:</span>
              <span className="font-bold text-slate-800">{user.full_name}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-400 font-medium">Assigned Role:</span>
              <span className="font-bold px-2 py-0.5 rounded bg-brand-50 text-brand-700 border border-brand-200">
                {user.role}
              </span>
            </div>
            {state?.screen && (
              <div className="flex justify-between items-center pt-1 border-t border-slate-200/60">
                <span className="text-slate-400 font-medium">Restricted Module:</span>
                <span className="font-semibold text-rose-700">{state.screen}</span>
              </div>
            )}
          </div>
        ) : (
          <div className="bg-amber-50 rounded-2xl p-4 border border-amber-200 text-xs text-amber-800">
            Your session has expired or you are not currently signed in.
          </div>
        )}

        {/* Action Buttons */}
        <div className="space-y-3 pt-2">
          <Link
            to={getHomeRoute()}
            className="w-full flex items-center justify-center gap-2 px-5 py-3 bg-brand-600 hover:bg-brand-700 text-white text-sm font-bold rounded-xl transition shadow-md shadow-brand-600/20"
          >
            <Home className="w-4 h-4" />
            {getHomeLabel()}
          </Link>

          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => navigate(-1)}
              className="flex items-center justify-center gap-1.5 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Go Back
            </button>
            <button
              onClick={handleLogout}
              className="flex items-center justify-center gap-1.5 px-4 py-2.5 bg-slate-100 hover:bg-rose-50 hover:text-rose-600 text-slate-700 text-xs font-bold rounded-xl transition"
            >
              <LogOut className="w-3.5 h-3.5" />
              Switch Account
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
