import React from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { FileQuestion, ArrowLeft, Home } from 'lucide-react';
import { getStoredUser } from '../api/client';

export const NotFoundPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const user = getStoredUser();

  // Determine user's primary landing home route based on role
  const getHomeRoute = (): string => {
    if (!user) return '/login';
    if (user.role === 'RECEPTIONIST') return '/appointments';
    return '/dashboard';
  };

  const getHomeLabel = (): string => {
    if (!user) return 'Go to Login';
    if (user.role === 'RECEPTIONIST') return 'Back to Appointments Queue';
    return 'Back to Dashboard';
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 text-center">
      <div className="max-w-md w-full bg-white rounded-3xl p-8 border border-slate-200/80 shadow-xl shadow-slate-200/50 space-y-6">
        {/* Not Found Badge & Icon */}
        <div className="w-16 h-16 bg-slate-100 border border-slate-200 text-slate-600 rounded-2xl flex items-center justify-center mx-auto shadow-sm">
          <FileQuestion className="w-9 h-9 text-brand-600" />
        </div>

        {/* Status & Title */}
        <div className="space-y-2">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-700">
            404 &bull; Page Not Found
          </span>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">
            Lost in the Clinic?
          </h1>
          <p className="text-sm text-slate-500 leading-relaxed">
            The page{' '}
            <code className="text-xs font-mono font-bold bg-slate-100 px-1.5 py-0.5 rounded text-slate-700">
              {location.pathname}
            </code>{' '}
            could not be found or has been moved.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="space-y-3 pt-2">
          <Link
            to={getHomeRoute()}
            className="w-full flex items-center justify-center gap-2 px-5 py-3 bg-brand-600 hover:bg-brand-700 text-white text-sm font-bold rounded-xl transition shadow-md shadow-brand-600/20"
          >
            <Home className="w-4 h-4" />
            {getHomeLabel()}
          </Link>

          <button
            onClick={() => navigate(-1)}
            className="w-full flex items-center justify-center gap-1.5 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Return to Previous Screen
          </button>
        </div>
      </div>
    </div>
  );
};
