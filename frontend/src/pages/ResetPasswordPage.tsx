import React, { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Lock, KeyRound, AlertCircle, CheckCircle2, ArrowLeft, Eye, EyeOff } from 'lucide-react';
import { z } from 'zod';
import { resetPasswordApi } from '../api/client';
import { clearOrValidateField } from '../utils/validation';

const resetPasswordFieldSchema = z.object({
  token: z.string().trim().min(10, 'Please enter a valid reset token'),
  newPassword: z.string().min(6, 'New password must be at least 6 characters'),
  confirmPassword: z.string().min(1, 'Please confirm your new password'),
});

const resetPasswordSchema = resetPasswordFieldSchema.refine(
  (data) => data.newPassword === data.confirmPassword,
  {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  }
);

export const ResetPasswordPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const [token, setToken] = useState(searchParams.get('token') || '');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormErrors({});
    setErrorMessage('');

    const validation = resetPasswordSchema.safeParse({
      token,
      newPassword,
      confirmPassword,
    });

    if (!validation.success) {
      const fieldErrors: Record<string, string> = {};
      validation.error.issues.forEach((issue) => {
        const key = issue.path[0] ? String(issue.path[0]) : '_global';
        if (!fieldErrors[key]) {
          fieldErrors[key] = issue.message;
        }
      });
      setFormErrors(fieldErrors);
      return;
    }

    try {
      setLoading(true);
      const res = await resetPasswordApi(token.trim(), newPassword);
      setSuccessMessage(res.message);
    } catch (err: any) {
      setErrorMessage(err.response?.data?.detail || 'Failed to reset password.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col justify-center items-center p-4">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-brand-900/30 via-slate-900 to-slate-950 pointer-events-none"></div>

      <div className="relative w-full max-w-sm bg-white rounded-2xl p-6 shadow-2xl border border-slate-100 space-y-5">
        <div className="text-center space-y-1.5">
          <div className="w-11 h-11 mx-auto rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
            <Lock className="w-5 h-5" />
          </div>
          <h2 className="text-lg font-bold text-slate-900">Reset Password</h2>
          <p className="text-xs text-slate-500">Choose a new password for your account</p>
        </div>

        {errorMessage && (
          <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {successMessage ? (
          <div className="space-y-3">
            <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <span>{successMessage}</span>
            </div>
            <Link to="/login" className="ui-btn-primary w-full h-9 text-xs font-bold">
              Go to Sign In
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} noValidate className="space-y-3.5">
            {!searchParams.get('token') && (
              <div>
                <label className="ui-label">Reset Token <span className="text-rose-500">*</span></label>
                <div className="relative">
                  <KeyRound className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={token}
                    onChange={(e) => {
                      const val = e.target.value;
                      setToken(val);
                      setFormErrors((prev) => clearOrValidateField(resetPasswordFieldSchema, 'token', val, prev));
                    }}
                    placeholder="Paste reset token"
                    className={`ui-input pl-8 font-mono ${formErrors.token ? 'border-rose-400 bg-rose-50' : ''}`}
                  />
                </div>
                {formErrors.token && (
                  <p className="text-[11px] text-rose-600 mt-1 font-medium">{formErrors.token}</p>
                )}
              </div>
            )}

            <div>
              <label className="ui-label">New Password <span className="text-rose-500">*</span></label>
              <div className="relative">
                <Lock className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(e) => {
                    const val = e.target.value;
                    setNewPassword(val);
                    setFormErrors((prev) => {
                      const updated = clearOrValidateField(resetPasswordFieldSchema, 'newPassword', val, prev);
                      if (updated.confirmPassword && val === confirmPassword) {
                        delete updated.confirmPassword;
                      }
                      return updated;
                    });
                  }}
                  placeholder="Min 6 characters"
                  className={`ui-input pl-8 pr-9 ${formErrors.newPassword ? 'border-rose-400 bg-rose-50' : ''}`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((p) => !p)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
              {formErrors.newPassword && (
                <p className="text-[11px] text-rose-600 mt-1 font-medium">{formErrors.newPassword}</p>
              )}
            </div>

            <div>
              <label className="ui-label">Confirm New Password <span className="text-rose-500">*</span></label>
              <div className="relative">
                <Lock className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => {
                    const val = e.target.value;
                    setConfirmPassword(val);
                    setFormErrors((prev) => {
                      if (!prev.confirmPassword) return prev;
                      const next = { ...prev };
                      if (val && val === newPassword) {
                        delete next.confirmPassword;
                      } else if (!val) {
                        next.confirmPassword = 'Please confirm your new password';
                      } else {
                        next.confirmPassword = 'Passwords do not match';
                      }
                      return next;
                    });
                  }}
                  placeholder="Re-enter new password"
                  className={`ui-input pl-8 ${formErrors.confirmPassword ? 'border-rose-400 bg-rose-50' : ''}`}
                />
              </div>
              {formErrors.confirmPassword && (
                <p className="text-[11px] text-rose-600 mt-1 font-medium">{formErrors.confirmPassword}</p>
              )}
            </div>

            <button
              type="submit"
              disabled={loading}
              className="ui-btn-primary w-full h-9 text-xs font-bold"
            >
              {loading ? 'Resetting...' : 'Reset Password'}
            </button>
          </form>
        )}

        <div className="text-center pt-2 border-t border-slate-100">
          <Link
            to="/login"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-indigo-600"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Sign In</span>
          </Link>
        </div>
      </div>
    </div>
  );
};
