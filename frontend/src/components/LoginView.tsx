import React, { useState } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { Stethoscope, ShieldCheck, User, Lock, AlertCircle, ArrowRight, Eye, EyeOff } from 'lucide-react';
import { z } from 'zod';
import { loginApi, getStoredUser } from '../api/client';
import { AdminUser } from '../types';
import { clearOrValidateField } from '../utils/validation';

const loginSchema = z.object({
  username: z.string().trim().min(1, 'Username is required'),
  password: z.string().min(1, 'Password is required'),
});

interface LoginViewProps {
  onLoginSuccess?: (user: AdminUser) => void;
}

export const LoginView: React.FC<LoginViewProps> = ({ onLoginSuccess }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  React.useEffect(() => {
    const user = getStoredUser();
    if (user) {
      const target = user.role === 'RECEPTIONIST' ? '/appointments' : '/dashboard';
      navigate(target, { replace: true });
    }
  }, [navigate]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormErrors({});
    setErrorMessage('');

    const validation = loginSchema.safeParse({ username, password });
    if (!validation.success) {
      const fieldErrors: Record<string, string> = {};
      validation.error.issues.forEach((issue) => {
        const key = issue.path[0] ? String(issue.path[0]) : '_global';
        if (!fieldErrors[key]) fieldErrors[key] = issue.message;
      });
      setFormErrors(fieldErrors);
      return;
    }

    try {
      setLoading(true);
      const res = await loginApi(username.trim(), password);
      if (onLoginSuccess) {
        onLoginSuccess(res.user);
      }
      const from = (location.state as any)?.from?.pathname;
      const defaultTarget = res.user.role === 'RECEPTIONIST' ? '/appointments' : '/dashboard';
      navigate(from || defaultTarget, { replace: true });
    } catch (err: any) {
      if (err.message === 'Network Error' || !err.response) {
        setErrorMessage('Cannot connect to backend API server. Please ensure the backend is running.');
      } else {
        setErrorMessage(err.response?.data?.detail || 'Invalid username or password');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col justify-center items-center p-4">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-brand-900/30 via-slate-900 to-slate-950 pointer-events-none"></div>

      <div className="relative w-full max-w-sm bg-white rounded-2xl p-6 shadow-2xl border border-slate-100 space-y-5">
        <div className="text-center space-y-1.5">
          <div className="w-11 h-11 mx-auto rounded-xl bg-gradient-to-tr from-brand-600 to-emerald-400 flex items-center justify-center text-white shadow-md shadow-brand-500/30">
            <Stethoscope className="w-5 h-5" />
          </div>
          <h2 className="text-lg font-bold text-slate-900 tracking-tight">Clinic Portal Sign In</h2>
          <p className="text-xs text-slate-500">Enter your credentials to continue</p>
        </div>

        {errorMessage && (
          <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        <form onSubmit={handleLogin} noValidate className="space-y-3.5">
          <div>
            <label className="ui-label">Username</label>
            <div className="relative">
              <User className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                autoFocus
                value={username}
                onChange={(e) => {
                  const val = e.target.value;
                  setUsername(val);
                  setFormErrors((prev) => clearOrValidateField(loginSchema, 'username', val, prev));
                  if (errorMessage) setErrorMessage('');
                }}
                placeholder="Enter username"
                className={`ui-input pl-8 ${formErrors.username ? 'border-rose-400 bg-rose-50' : ''}`}
              />
            </div>
            {formErrors.username && (
              <p className="text-[11px] text-rose-600 mt-1 font-medium">{formErrors.username}</p>
            )}
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="ui-label mb-0">Password</label>
              <Link
                to="/forgot-password"
                className="text-[11px] font-semibold text-indigo-600 hover:text-indigo-800 hover:underline"
              >
                Forgot password?
              </Link>
            </div>
            <div className="relative">
              <Lock className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => {
                  const val = e.target.value;
                  setPassword(val);
                  setFormErrors((prev) => clearOrValidateField(loginSchema, 'password', val, prev));
                  if (errorMessage) setErrorMessage('');
                }}
                placeholder="Enter password"
                className={`ui-input pl-8 pr-9 ${formErrors.password ? 'border-rose-400 bg-rose-50' : ''}`}
              />
              <button
                type="button"
                onClick={() => setShowPassword((p) => !p)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            </div>
            {formErrors.password && (
              <p className="text-[11px] text-rose-600 mt-1 font-medium">{formErrors.password}</p>
            )}
          </div>

          <button
            type="submit"
            disabled={loading}
            className="ui-btn-primary w-full h-9 text-xs font-bold"
          >
            {loading ? (
              <span>Signing in...</span>
            ) : (
              <>
                <span>Sign In</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </>
            )}
          </button>
        </form>

        <div className="text-center text-[11px] text-slate-400 flex items-center justify-center gap-1 pt-1 border-t border-slate-100">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
          <span>Secured with JWT &amp; Role-Based Access</span>
        </div>
      </div>
    </div>
  );
};
