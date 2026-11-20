import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Stethoscope, ShieldCheck, User, Lock, AlertCircle, ArrowRight } from 'lucide-react';
import { loginApi, getStoredUser } from '../api/client';
import { AdminUser } from '../types';

interface LoginViewProps {
  onLoginSuccess?: (user: AdminUser) => void;
}

export const LoginView: React.FC<LoginViewProps> = ({ onLoginSuccess }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [username, setUsername] = useState('superadmin');
  const [password, setPassword] = useState('superadmin123');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  // If already logged in, redirect
  React.useEffect(() => {
    const user = getStoredUser();
    if (user) {
      const target = user.role === 'RECEPTIONIST' ? '/appointments' : '/dashboard';
      navigate(target, { replace: true });
    }
  }, [navigate]);

  const handleLogin = async (e?: React.FormEvent, u?: string, p?: string) => {
    if (e) e.preventDefault();
    const finalUser = u || username;
    const finalPass = p || password;

    try {
      setLoading(true);
      setErrorMessage('');
      const res = await loginApi(finalUser, finalPass);
      if (onLoginSuccess) {
        onLoginSuccess(res.user);
      }
      const from = (location.state as any)?.from?.pathname;
      const defaultTarget = res.user.role === 'RECEPTIONIST' ? '/appointments' : '/dashboard';
      navigate(from || defaultTarget, { replace: true });
    } catch (err: any) {
      if (err.message === 'Network Error' || !err.response) {
        setErrorMessage('Cannot connect to backend API server at http://localhost:8000. Please ensure the backend is running (python run.py).');
      } else {
        setErrorMessage(err.response?.data?.detail || 'Invalid username or password');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleQuickLogin = (u: string, p: string) => {
    setUsername(u);
    setPassword(p);
    handleLogin(undefined, u, p);
  };

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col justify-center items-center p-4">
      {/* Background radial gradient */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-brand-900/30 via-slate-900 to-slate-950 pointer-events-none"></div>

      <div className="relative w-full max-w-md bg-white rounded-3xl p-8 shadow-2xl border border-slate-100 space-y-6">
        {/* Brand header */}
        <div className="text-center space-y-2">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-gradient-to-tr from-brand-600 to-emerald-400 flex items-center justify-center text-white shadow-lg shadow-brand-500/30">
            <Stethoscope className="w-7 h-7" />
          </div>
          <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight">Siddhi Clinic Assistant</h2>
          <p className="text-xs text-slate-500 font-medium">
            Multi-Tenant Role-Based Access Control (RBAC) Portal
          </p>
        </div>

        {/* Quick Role Demo Selector */}
        <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200/80 space-y-2">
          <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider text-center">
            ⚡ Default Platform Administrator
          </p>
          <div className="grid grid-cols-1 gap-2">
            <button
              type="button"
              onClick={() => handleQuickLogin('superadmin', 'superadmin123')}
              className="w-full py-2.5 px-3 bg-white hover:bg-brand-50 border border-slate-200 hover:border-brand-300 rounded-xl text-left flex items-center justify-between text-xs transition shadow-2xs group"
            >
              <div>
                <p className="font-bold text-slate-800 flex items-center gap-1.5">
                  <span className="text-sm">👑</span> Super Admin (Product Owner)
                </p>
                <p className="text-[10px] text-slate-400">Onboard clinic tenants, view global analytics & provision isolated schemas</p>
              </div>
              <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-brand-600 transition shrink-0" />
            </button>
          </div>
          <div className="px-1 py-1 text-[10px] text-slate-500 text-center">
            Clinic Admins (Doctors) and Front Desk staff log in using the credentials created by their Clinic Administrator.
          </div>
        </div>

        {/* Error Alert */}
        {errorMessage && (
          <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Login Form */}
        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Username</label>
            <div className="relative">
              <User className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
              <input
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="superadmin / doctor / frontdesk"
                className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Password</label>
            <div className="relative">
              <Lock className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 px-4 rounded-xl bg-brand-600 hover:bg-brand-700 text-white font-bold text-sm transition shadow-md shadow-brand-600/30 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading ? (
              <span>Authenticating...</span>
            ) : (
              <>
                <span>Sign In to Admin Portal</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        <div className="text-center text-[11px] text-slate-400 flex items-center justify-center gap-1">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
          <span>Secured with JWT and Role-Based Authorization</span>
        </div>
      </div>
    </div>
  );
};
