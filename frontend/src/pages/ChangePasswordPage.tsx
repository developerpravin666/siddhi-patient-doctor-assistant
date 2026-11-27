import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Lock, AlertCircle, CheckCircle2, Save, Eye, EyeOff, ArrowLeft } from 'lucide-react';
import { z } from 'zod';
import { changePasswordApi } from '../api/client';
import { clearOrValidateField } from '../utils/validation';

const changePasswordFieldSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z.string().min(6, 'New password must be at least 6 characters'),
  confirmPassword: z.string().min(1, 'Please confirm your new password'),
});

const changePasswordSchema = changePasswordFieldSchema.refine(
  (data) => data.newPassword === data.confirmPassword,
  {
    message: 'New passwords do not match',
    path: ['confirmPassword'],
  }
);

export const ChangePasswordPage: React.FC = () => {
  const navigate = useNavigate();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPasswords, setShowPasswords] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormErrors({});
    setErrorMessage('');
    setSuccessMessage('');

    const validation = changePasswordSchema.safeParse({
      currentPassword,
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
      const res = await changePasswordApi(currentPassword, newPassword);
      setSuccessMessage(res.message);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      setErrorMessage(err.response?.data?.detail || 'Failed to change password.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full space-y-3.5">
      <div className="flex items-center justify-between gap-3 pb-2.5 border-b border-slate-200">
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition"
            title="Go Back"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h1 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <Lock className="w-4 h-4 text-indigo-600" />
              Change Password
            </h1>
            <p className="text-[11px] text-slate-500">Update your account password</p>
          </div>
        </div>
      </div>

      {errorMessage && (
        <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {successMessage && (
        <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} noValidate className="ui-card space-y-3.5">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="ui-label">Current Password <span className="text-rose-500">*</span></label>
            <div className="relative">
              <input
                type={showPasswords ? 'text' : 'password'}
                value={currentPassword}
                onChange={(e) => {
                  const val = e.target.value;
                  setCurrentPassword(val);
                  setFormErrors((prev) => clearOrValidateField(changePasswordFieldSchema, 'currentPassword', val, prev));
                }}
                placeholder="Enter current password"
                className={`ui-input pr-9 ${formErrors.currentPassword ? 'border-rose-400 bg-rose-50' : ''}`}
              />
              <button
                type="button"
                onClick={() => setShowPasswords((p) => !p)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                {showPasswords ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            </div>
            {formErrors.currentPassword && (
              <p className="text-[11px] text-rose-600 mt-1 font-medium">{formErrors.currentPassword}</p>
            )}
          </div>

          <div>
            <label className="ui-label">New Password <span className="text-rose-500">*</span></label>
            <input
              type={showPasswords ? 'text' : 'password'}
              value={newPassword}
              onChange={(e) => {
                const val = e.target.value;
                setNewPassword(val);
                setFormErrors((prev) => {
                  const updated = clearOrValidateField(changePasswordFieldSchema, 'newPassword', val, prev);
                  if (updated.confirmPassword && val === confirmPassword) {
                    delete updated.confirmPassword;
                  }
                  return updated;
                });
              }}
              placeholder="Min 6 characters"
              className={`ui-input ${formErrors.newPassword ? 'border-rose-400 bg-rose-50' : ''}`}
            />
            {formErrors.newPassword && (
              <p className="text-[11px] text-rose-600 mt-1 font-medium">{formErrors.newPassword}</p>
            )}
          </div>

          <div>
            <label className="ui-label">Confirm New Password <span className="text-rose-500">*</span></label>
            <input
              type={showPasswords ? 'text' : 'password'}
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
                    next.confirmPassword = 'New passwords do not match';
                  }
                  return next;
                });
              }}
              placeholder="Re-enter new password"
              className={`ui-input ${formErrors.confirmPassword ? 'border-rose-400 bg-rose-50' : ''}`}
            />
            {formErrors.confirmPassword && (
              <p className="text-[11px] text-rose-600 mt-1 font-medium">{formErrors.confirmPassword}</p>
            )}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="ui-btn-secondary"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading}
            className="ui-btn-primary"
          >
            <Save className="w-3.5 h-3.5" />
            <span>{loading ? 'Updating...' : 'Update Password'}</span>
          </button>
        </div>
      </form>
    </div>
  );
};
