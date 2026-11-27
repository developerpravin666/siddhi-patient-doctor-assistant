import React, { useState, useEffect } from 'react';
import { useNavigate, useParams, Link, useOutletContext } from 'react-router-dom';
import { 
  UserCheck, 
  ArrowLeft, 
  Shield, 
  KeyRound, 
  Eye, 
  PlusCircle, 
  Edit3, 
  Trash2, 
  AlertCircle, 
  Save, 
  RotateCcw
} from 'lucide-react';
import { z } from 'zod';
import { getUser, createUser, updateUser } from '../api/client';
import { UserRole, ScreenPermissions, AppContextType } from '../types';
import { SearchableSelect } from '../components/SearchableSelect';
import { clearOrValidateField } from '../utils/validation';

const DEFAULT_FRONTDESK_PERMISSIONS: ScreenPermissions = {
  appointments: { view: true, create: true, edit: true, delete: false },
  patients: { view: true, create: true, edit: true, delete: false },
  doctors: { view: true, create: false, edit: false, delete: false },
  simulator: { view: true, create: true, edit: false, delete: false },
  analytics: { view: false, create: false, edit: false, delete: false },
};

const SCREEN_METADATA = [
  { key: 'appointments', label: 'Appointments Queue', desc: 'Patient booking list, slot assignment & status changes' },
  { key: 'patients', label: 'Patients Directory', desc: 'Patient profiles, contact details & contact info' },
  { key: 'doctors', label: 'Doctors & Schedules', desc: 'Doctor working hours, consultation slots & profiles' },
  { key: 'simulator', label: 'WhatsApp Simulator', desc: 'AI Receptionist chat simulation & conversational test' },
  { key: 'analytics', label: 'Clinic Analytics & KPIs', desc: 'Daily statistics, booking volume & performance reports' },
];

export const UserForm: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const isEditMode = Boolean(id);
  const navigate = useNavigate();
  const outlet = useOutletContext<AppContextType>();
  const currentUserRole = outlet?.userRole || 'CLINIC_ADMIN';

  // Form Fields
  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<UserRole>('RECEPTIONIST');
  const [permissions, setPermissions] = useState<ScreenPermissions>(DEFAULT_FRONTDESK_PERMISSIONS);

  const [loading, setLoading] = useState(isEditMode);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Dynamic Zod Schema based on isEditMode
  const userSchema = z.object({
    fullName: z.string().trim().min(2, 'Full Name must be at least 2 characters').max(100, 'Full Name must not exceed 100 characters'),
    username: z.string().trim()
      .min(3, 'Username must be at least 3 characters')
      .max(50, 'Username must not exceed 50 characters')
      .regex(/^[a-zA-Z0-9_-]+$/, 'Username can only contain letters, numbers, hyphens, and underscores'),
    password: isEditMode
      ? z.string().refine((val) => val === '' || val.length >= 6, {
          message: 'Password must be at least 6 characters if updating',
        })
      : z.string().min(6, 'Password is required and must be at least 6 characters'),
    role: z.enum(['SUPER_ADMIN', 'CLINIC_ADMIN', 'RECEPTIONIST'] as const),
  });

  useEffect(() => {
    if (isEditMode && id) {
      const fetchUserData = async () => {
        try {
          setLoading(true);
          const user = await getUser(id);
          setFullName(user.full_name);
          setUsername(user.username);
          setRole(user.role);
          if (user.permissions) {
            setPermissions({ ...DEFAULT_FRONTDESK_PERMISSIONS, ...user.permissions });
          }
        } catch (err: any) {
          setErrorMessage(err.response?.data?.detail || 'Failed to load user account details.');
        } finally {
          setLoading(false);
        }
      };
      fetchUserData();
    }
  }, [id, isEditMode]);

  const handlePermissionToggle = (screenKey: string, action: 'view' | 'create' | 'edit' | 'delete') => {
    setPermissions((prev) => {
      const currentScreenPerms = prev[screenKey] || { view: false, create: false, edit: false, delete: false };
      const nextValue = !currentScreenPerms[action];
      const updatedScreen = { ...currentScreenPerms, [action]: nextValue };

      // If granting create/edit/delete, ensure view is also granted
      if (nextValue && (action === 'create' || action === 'edit' || action === 'delete')) {
        updatedScreen.view = true;
      }
      // If revoking view, also revoke write permissions
      if (!nextValue && action === 'view') {
        updatedScreen.create = false;
        updatedScreen.edit = false;
        updatedScreen.delete = false;
      }

      return {
        ...prev,
        [screenKey]: updatedScreen,
      };
    });
  };

  const applyPreset = (preset: 'standard' | 'read_only' | 'full' | 'clear') => {
    if (preset === 'standard') {
      setPermissions(DEFAULT_FRONTDESK_PERMISSIONS);
    } else if (preset === 'read_only') {
      const ro: ScreenPermissions = {};
      SCREEN_METADATA.forEach((s) => {
        ro[s.key] = { view: true, create: false, edit: false, delete: false };
      });
      setPermissions(ro);
    } else if (preset === 'full') {
      const full: ScreenPermissions = {};
      SCREEN_METADATA.forEach((s) => {
        full[s.key] = { view: true, create: true, edit: true, delete: true };
      });
      setPermissions(full);
    } else if (preset === 'clear') {
      const empty: ScreenPermissions = {};
      SCREEN_METADATA.forEach((s) => {
        empty[s.key] = { view: false, create: false, edit: false, delete: false };
      });
      setPermissions(empty);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    setErrorMessage('');

    const validationResult = userSchema.safeParse({
      fullName,
      username,
      password,
      role,
    });

    if (!validationResult.success) {
      const fieldErrors: Record<string, string> = {};
      validationResult.error.issues.forEach((issue) => {
        if (issue.path[0]) {
          fieldErrors[issue.path[0].toString()] = issue.message;
        }
      });
      setErrors(fieldErrors);
      return;
    }

    try {
      setSaving(true);
      if (isEditMode && id) {
        await updateUser(id, {
          full_name: fullName.trim(),
          role,
          permissions: role === 'RECEPTIONIST' ? permissions : undefined,
          ...(password ? { password } : {}),
        });
      } else {
        await createUser({
          full_name: fullName.trim(),
          username: username.trim(),
          password,
          role,
          permissions: role === 'RECEPTIONIST' ? permissions : undefined,
        });
      }

      navigate('/users');
    } catch (err: any) {
      setErrorMessage(err.response?.data?.detail || 'Failed to save staff account.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="p-12 text-center text-slate-500">
        <UserCheck className="w-8 h-8 animate-spin mx-auto mb-2 text-indigo-600" />
        <p>Loading user details...</p>
      </div>
    );
  }

  return (
    <div className="w-full space-y-3.5">
      {/* Top Breadcrumb & Header */}
      <div className="flex items-center justify-between gap-3 pb-2.5 border-b border-slate-200">
        <div className="flex items-center gap-2.5">
          <Link
            to="/users"
            className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition"
            title="Back to Staff Directory"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <span className="p-1.5 bg-indigo-50 text-indigo-600 rounded-lg">
                <UserCheck className="w-4 h-4" />
              </span>
              <h1 className="text-lg font-bold text-slate-900">
                {isEditMode ? 'Edit Staff Account' : 'Create Clinic Staff & Front Desk Account'}
              </h1>
            </div>
            <p className="text-[11px] text-slate-500 mt-0.5">
              {isEditMode
                ? 'Update credentials, role assignment, and granular screen access.'
                : 'Add a receptionist or staff member and customize their screen permissions.'}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => navigate('/users')}
          className="ui-btn-secondary"
        >
          Cancel
        </button>
      </div>

      {/* Error Alert */}
      {errorMessage && (
        <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-lg text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Form */}
      <form onSubmit={handleSubmit} className="space-y-3.5">
        <div className="ui-card space-y-3">
          <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2 pb-2 border-b border-slate-100">
            <KeyRound className="w-4 h-4 text-indigo-600" />
            Basic Profile & Login Credentials
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <label className="ui-label">
                Full Name <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                placeholder="e.g. Priya Sharma"
                value={fullName}
                onChange={(e) => {
                  const val = e.target.value;
                  setFullName(val);
                  setErrors((prev) => clearOrValidateField(userSchema, 'fullName', val, prev));
                }}
                className={`ui-input ${errors.fullName ? 'border-rose-400 bg-rose-50' : ''}`}
              />
              {errors.fullName && <p className="text-[11px] text-rose-600 mt-1 font-medium">{errors.fullName}</p>}
            </div>

            <div>
              <label className="ui-label">
                Username <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                disabled={isEditMode}
                placeholder="e.g. priya_frontdesk"
                value={username}
                onChange={(e) => {
                  const val = e.target.value;
                  setUsername(val);
                  setErrors((prev) => clearOrValidateField(userSchema, 'username', val, prev));
                }}
                className={`ui-input ${errors.username ? 'border-rose-400 bg-rose-50' : ''} ${
                  isEditMode ? 'bg-slate-100 text-slate-500 cursor-not-allowed' : ''
                }`}
              />
              {errors.username && (
                <p className="text-[11px] text-rose-600 mt-1 font-medium">{errors.username}</p>
              )}
            </div>

            <div>
              <label className="ui-label">
                Password {isEditMode ? <span className="text-slate-400 font-normal">(Optional)</span> : <span className="text-rose-500">*</span>}
              </label>
              <input
                type="password"
                placeholder={isEditMode ? '••••••••' : 'Minimum 6 characters'}
                value={password}
                onChange={(e) => {
                  const val = e.target.value;
                  setPassword(val);
                  setErrors((prev) => clearOrValidateField(userSchema, 'password', val, prev));
                }}
                className={`ui-input ${errors.password ? 'border-rose-400 bg-rose-50' : ''}`}
              />
              {errors.password && <p className="text-[11px] text-rose-600 mt-1 font-medium">{errors.password}</p>}
            </div>

            <div>
              <label className="ui-label">
                Account Role <span className="text-rose-500">*</span>
              </label>
              <SearchableSelect
                value={role}
                onChange={(val) => setRole(val as UserRole)}
                disabled={currentUserRole === 'CLINIC_ADMIN' && role !== 'RECEPTIONIST'}
                searchable={false}
                options={[
                  { value: 'RECEPTIONIST', label: 'Receptionist / Front Desk' },
                  ...(currentUserRole === 'SUPER_ADMIN' ? [
                    { value: 'CLINIC_ADMIN', label: 'Clinic Admin / Doctor' },
                    { value: 'SUPER_ADMIN', label: 'Super Admin' },
                  ] : []),
                ]}
              />
            </div>
          </div>
        </div>

        {/* Screen Permissions Matrix for Receptionist */}
        {role === 'RECEPTIONIST' && (
          <div className="ui-card space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pb-2 border-b border-slate-100">
              <div>
                <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                  <Shield className="w-4 h-4 text-indigo-600" />
                  Granular Screen Access & Action Permissions Matrix
                </h2>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Specify which screens this staff member can view, create, edit, or delete.
                </p>
              </div>

              {/* Presets */}
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mr-1">Presets:</span>
                <button
                  type="button"
                  onClick={() => applyPreset('standard')}
                  className="px-2 py-1 text-xs font-semibold bg-indigo-50 text-indigo-700 hover:bg-indigo-100 rounded-lg transition"
                >
                  Front Desk Default
                </button>
                <button
                  type="button"
                  onClick={() => applyPreset('read_only')}
                  className="px-2 py-1 text-xs font-semibold bg-slate-100 text-slate-700 hover:bg-slate-200 rounded-lg transition"
                >
                  View Only
                </button>
                <button
                  type="button"
                  onClick={() => applyPreset('full')}
                  className="px-2 py-1 text-xs font-semibold bg-emerald-50 text-emerald-700 hover:bg-emerald-100 rounded-lg transition"
                >
                  Full Access
                </button>
                <button
                  type="button"
                  onClick={() => applyPreset('clear')}
                  className="p-1 text-slate-400 hover:text-slate-600 rounded-lg transition"
                  title="Clear All Permissions"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Permission Table */}
            <div className="overflow-x-auto border border-slate-200 rounded-lg">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-[11px] font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200">
                  <tr>
                    <th className="px-3 py-2">Screen Feature</th>
                    <th className="px-3 py-2 text-center">
                      <span className="inline-flex items-center gap-1 text-indigo-600">
                        <Eye className="w-3.5 h-3.5" /> View
                      </span>
                    </th>
                    <th className="px-3 py-2 text-center">
                      <span className="inline-flex items-center gap-1 text-emerald-600">
                        <PlusCircle className="w-3.5 h-3.5" /> Add
                      </span>
                    </th>
                    <th className="px-3 py-2 text-center">
                      <span className="inline-flex items-center gap-1 text-amber-600">
                        <Edit3 className="w-3.5 h-3.5" /> Edit
                      </span>
                    </th>
                    <th className="px-3 py-2 text-center">
                      <span className="inline-flex items-center gap-1 text-rose-600">
                        <Trash2 className="w-3.5 h-3.5" /> Delete
                      </span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {SCREEN_METADATA.map((screen) => {
                    const currentPerm = permissions[screen.key] || {
                      view: false,
                      create: false,
                      edit: false,
                      delete: false,
                    };

                    return (
                      <tr key={screen.key} className="hover:bg-slate-50/50 transition">
                        <td className="px-3 py-1.5">
                          <p className="font-semibold text-slate-900 text-xs">{screen.label}</p>
                          <p className="text-[11px] text-slate-500">{screen.desc}</p>
                        </td>

                        {/* View */}
                        <td className="px-3 py-1.5 text-center">
                          <input
                            type="checkbox"
                            checked={currentPerm.view}
                            onChange={() => handlePermissionToggle(screen.key, 'view')}
                            className="w-3.5 h-3.5 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500 cursor-pointer"
                          />
                        </td>

                        {/* Create */}
                        <td className="px-3 py-1.5 text-center">
                          <input
                            type="checkbox"
                            checked={currentPerm.create}
                            onChange={() => handlePermissionToggle(screen.key, 'create')}
                            className="w-3.5 h-3.5 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500 cursor-pointer"
                          />
                        </td>

                        {/* Edit */}
                        <td className="px-3 py-1.5 text-center">
                          <input
                            type="checkbox"
                            checked={currentPerm.edit}
                            onChange={() => handlePermissionToggle(screen.key, 'edit')}
                            className="w-3.5 h-3.5 text-amber-600 rounded border-slate-300 focus:ring-amber-500 cursor-pointer"
                          />
                        </td>

                        {/* Delete */}
                        <td className="px-3 py-1.5 text-center">
                          <input
                            type="checkbox"
                            checked={currentPerm.delete}
                            onChange={() => handlePermissionToggle(screen.key, 'delete')}
                            className="w-3.5 h-3.5 text-rose-600 rounded border-slate-300 focus:ring-rose-500 cursor-pointer"
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Footer Actions */}
        <div className="flex items-center justify-end gap-2.5 pt-1">
          <button
            type="button"
            onClick={() => navigate('/users')}
            className="ui-btn-secondary"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="ui-btn-primary"
          >
            <Save className="w-3.5 h-3.5" />
            {saving ? 'Saving...' : isEditMode ? 'Update Staff Account' : 'Create Staff Account'}
          </button>
        </div>
      </form>
    </div>
  );
};
