import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { KeyRound, User, AlertCircle, CheckCircle2, ArrowLeft, ArrowRight } from 'lucide-react';
import { z } from 'zod';
import { forgotPasswordApi } from '../api/client';
import { clearOrValidateField } from '../utils/validation';

const forgotPasswordSchema = z.object({
  username: z.string().trim().min(2, 'Please enter your username'),
});

export const ForgotPasswordPage: React.FC = () => {
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [resultMessage, setResultMessage] = useState('');
  const [resetToken, setResetToken] = useState<string | null>(null);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormErrors({});
    setErrorMessage('');

    const validation = forgotPasswordSchema.safeParse({ username });
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
      const res = await forgotPasswordApi(username.trim());
      setResultMessage(res.message);
      if (res.reset_token) {
        setResetToken(res.reset_token);
      }
    } catch (err: any) {
      setErrorMessage(err.response?.data?.detail || 'Failed to process password reset request.');
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
            <KeyRound className="w-5 h-5" />
          </div>
          <h2 className="text-lg font-bold text-slate-900">Forgot Password</h2>
          <p className="text-xs text-slate-500">Enter your username to generate a password reset token</p>
        </div>

        {errorMessage && (
          <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {resultMessage ? (
          <div className="space-y-3">
            <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <span>{resultMessage}</span>
            </div>

            {resetToken && (
              <button
                type="button"
                onClick={() => navigate(`/reset-password?token=${encodeURIComponent(resetToken)}`)}
                className="ui-btn-primary w-full h-9 text-xs font-bold"
              >
                <span>Proceed to Reset Password</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        ) : (
          <form onSubmit={handleSubmit} noValidate className="space-y-3.5">
            <div>
              <label className="ui-label">Username <span className="text-rose-500">*</span></label>
              <div className="relative">
                <User className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  autoFocus
                  value={username}
                  onChange={(e) => {
                    const val = e.target.value;
                    setUsername(val);
                    setFormErrors((prev) => clearOrValidateField(forgotPasswordSchema, 'username', val, prev));
                  }}
                  placeholder="Enter username"
                  className={`ui-input pl-8 ${formErrors.username ? 'border-rose-400 bg-rose-50' : ''}`}
                />
              </div>
              {formErrors.username && (
                <p className="text-[11px] text-rose-600 mt-1 font-medium">{formErrors.username}</p>
              )}
            </div>

            <button
              type="submit"
              disabled={loading}
              className="ui-btn-primary w-full h-9 text-xs font-bold"
            >
              {loading ? 'Sending...' : 'Request Password Reset'}
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
