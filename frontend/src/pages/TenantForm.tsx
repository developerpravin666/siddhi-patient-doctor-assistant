import React, { useState, useEffect } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import {
  Building2,
  ArrowLeft,
  Database,
  Stethoscope,
  Phone,
  Mail,
  KeyRound,
  User,
  Eye,
  EyeOff,
  AlertCircle,
  CheckCircle2,
  Copy,
  Check,
  Save,
  RotateCcw,
  Sparkles
} from 'lucide-react';
import { z } from 'zod';
import { getTenant, createTenant, updateTenant } from '../api/client';
import { clearOrValidateField } from '../utils/validation';

const tenantCreateSchema = z.object({
  name: z.string().trim()
    .min(2, 'Clinic name must be at least 2 characters')
    .max(100, 'Clinic name cannot exceed 100 characters'),
  schema_name: z.string().trim()
    .min(3, 'Schema name must be at least 3 characters')
    .max(63, 'PostgreSQL schema name cannot exceed 63 characters')
    .regex(/^[a-z0-9_]+$/, 'Schema name can only contain lowercase letters, numbers, and underscores')
    .refine((val) => val.startsWith('clinic_') || val.startsWith('tenant_'), {
      message: 'Schema name must start with "clinic_" or "tenant_"',
    }),
  owner_name: z.string().trim()
    .min(2, 'Owner / Chief Doctor name must be at least 2 characters')
    .max(100, 'Owner name cannot exceed 100 characters')
    .optional()
    .or(z.literal('')),
  owner_phone: z.string().trim()
    .min(10, 'Contact phone must be at least 10 digits')
    .max(20, 'Contact phone cannot exceed 20 characters')
    .regex(/^[0-9+\s()-]+$/, 'Contact phone contains invalid characters')
    .optional()
    .or(z.literal('')),
  owner_email: z.string().trim()
    .email('Please enter a valid email address')
    .max(100, 'Email cannot exceed 100 characters')
    .optional()
    .or(z.literal('')),
  admin_username: z.string().trim()
    .min(3, 'Admin username must be at least 3 characters')
    .max(50, 'Admin username cannot exceed 50 characters')
    .regex(/^[a-zA-Z0-9_-]+$/, 'Username can only contain letters, numbers, hyphens, and underscores'),
  admin_password: z.string().trim()
    .min(6, 'Admin password must be at least 6 characters'),
  status: z.enum(['ACTIVE', 'SUSPENDED']).default('ACTIVE'),
});

const tenantEditSchema = z.object({
  name: z.string().trim()
    .min(2, 'Clinic name must be at least 2 characters')
    .max(100, 'Clinic name cannot exceed 100 characters'),
  owner_name: z.string().trim()
    .min(2, 'Owner / Chief Doctor name must be at least 2 characters')
    .max(100, 'Owner name cannot exceed 100 characters')
    .optional()
    .or(z.literal('')),
  owner_phone: z.string().trim()
    .min(10, 'Contact phone must be at least 10 digits')
    .max(20, 'Contact phone cannot exceed 20 characters')
    .regex(/^[0-9+\s()-]+$/, 'Contact phone contains invalid characters')
    .optional()
    .or(z.literal('')),
  owner_email: z.string().trim()
    .email('Please enter a valid email address')
    .max(100, 'Email cannot exceed 100 characters')
    .optional()
    .or(z.literal('')),
  status: z.enum(['ACTIVE', 'SUSPENDED']).default('ACTIVE'),
});

export const TenantForm: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const isEditMode = Boolean(id);
  const navigate = useNavigate();

  // Form Fields
  const [clinicName, setClinicName] = useState('');
  const [schemaName, setSchemaName] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [ownerPhone, setOwnerPhone] = useState('');
  const [ownerEmail, setOwnerEmail] = useState('');
  const [adminUsername, setAdminUsername] = useState('');
  const [adminPassword, setAdminPassword] = useState('clinic123');
  const [status, setStatus] = useState<'ACTIVE' | 'SUSPENDED'>('ACTIVE');

  // UI States
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(isEditMode);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Success reveal card after onboarding
  const [onboardedResult, setOnboardedResult] = useState<{
    name: string;
    schema: string;
    username: string;
    password: string;
  } | null>(null);

  // Fetch existing tenant if editing
  useEffect(() => {
    if (isEditMode && id) {
      const fetchTenant = async () => {
        try {
          setLoading(true);
          const data = await getTenant(id);
          setClinicName(data.name);
          setSchemaName(data.schema_name);
          setOwnerName(data.owner_name || '');
          setOwnerPhone(data.owner_phone || '');
          setOwnerEmail(data.owner_email || '');
          setStatus((data.status as 'ACTIVE' | 'SUSPENDED') || 'ACTIVE');
        } catch (err: any) {
          setErrorMessage(err.response?.data?.detail || 'Failed to load clinic tenant');
        } finally {
          setLoading(false);
        }
      };
      fetchTenant();
    }
  }, [isEditMode, id]);

  // Handle auto-slug for schema name and admin username on create mode
  const handleClinicNameChange = (name: string) => {
    setClinicName(name);
    if (fieldErrors.name) {
      setFieldErrors((prev) => ({ ...prev, name: '' }));
    }

    if (!isEditMode) {
      const slug = name
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '_')
        .replace(/_+/g, '_')
        .slice(0, 50);

      const generatedSchema = slug ? `clinic_${slug}` : '';
      setSchemaName(generatedSchema);

      if (!adminUsername || adminUsername.endsWith('_admin')) {
        setAdminUsername(slug ? `${slug.slice(0, 15)}_admin` : '');
      }
    }
  };

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    setFieldErrors({});

    const formData = {
      name: clinicName.trim(),
      schema_name: schemaName.trim(),
      owner_name: ownerName.trim() || undefined,
      owner_phone: ownerPhone.trim() || undefined,
      owner_email: ownerEmail.trim() || undefined,
      admin_username: adminUsername.trim(),
      admin_password: adminPassword.trim(),
      status,
    };

    // Zod validation
    const schema = isEditMode ? tenantEditSchema : tenantCreateSchema;
    const result = schema.safeParse(formData);

    if (!result.success) {
      const errors: Record<string, string> = {};
      result.error.issues.forEach((err) => {
        const field = err.path[0] as string;
        if (!errors[field]) {
          errors[field] = err.message;
        }
      });
      setFieldErrors(errors);
      return;
    }

    try {
      setSaving(true);
      if (isEditMode && id) {
        await updateTenant(id, {
          name: formData.name,
          owner_name: formData.owner_name,
          owner_phone: formData.owner_phone,
          owner_email: formData.owner_email,
          status: formData.status,
        });
        navigate('/tenants');
      } else {
        const created = await createTenant({
          name: formData.name,
          schema_name: formData.schema_name || undefined,
          owner_name: formData.owner_name,
          owner_phone: formData.owner_phone,
          owner_email: formData.owner_email,
          admin_username: formData.admin_username,
          admin_password: formData.admin_password,
          status: formData.status,
        });

        // Reveal provisioned credentials card
        setOnboardedResult({
          name: created.name,
          schema: created.schema_name,
          username: formData.admin_username,
          password: formData.admin_password,
        });
      }
    } catch (err: any) {
      setErrorMessage(err.response?.data?.detail || 'Failed to provision clinic tenant schema');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <div className="text-slate-400 text-sm font-semibold flex items-center gap-2">
          <div className="w-5 h-5 border-2 border-purple-600 border-t-transparent rounded-full animate-spin" />
          <span>Loading clinic tenant profile...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full space-y-3.5">
      {/* Header Bar */}
      <div className="flex items-center justify-between gap-3 pb-2.5 border-b border-slate-200">
        <div className="flex items-center gap-2.5">
          <Link
            to="/tenants"
            className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition"
            title="Back to Clinic Tenants"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <span className="p-1.5 bg-purple-50 text-purple-600 rounded-lg">
                <Building2 className="w-4 h-4" />
              </span>
              <h1 className="text-lg font-bold text-slate-900">
                {isEditMode ? 'Edit Clinic Tenant Profile' : 'Onboard New Clinic Tenant'}
              </h1>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 text-purple-800">
                Schema-Per-Tenant
              </span>
            </div>
            <p className="text-[11px] text-slate-500 mt-0.5">
              {isEditMode
                ? 'Update clinic contact, owner details, and active status.'
                : 'Provisions a dedicated PostgreSQL schema with independent clinical tables, doctors, and staff.'}
            </p>
          </div>
        </div>

        <Link to="/tenants" className="ui-btn-secondary">
          Cancel
        </Link>
      </div>

      {/* Success Reveal Card (Post-Onboarding) */}
      {onboardedResult ? (
        <div className="ui-card border-emerald-200 space-y-4 animate-in fade-in">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-lg bg-emerald-100 flex items-center justify-center text-emerald-600 shrink-0">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <div>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 uppercase tracking-wider">
                Provisioning Complete
              </span>
              <h2 className="text-base font-bold text-slate-900 mt-0.5">
                Clinic Tenant Onboarded Successfully!
              </h2>
              <p className="text-xs text-slate-500">
                An isolated PostgreSQL schema was provisioned via DDL with independent clinical tables.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs">
            <div>
              <span className="text-slate-400 font-semibold block text-[11px]">Clinic Name</span>
              <span className="text-slate-900 font-bold">{onboardedResult.name}</span>
            </div>
            <div>
              <span className="text-slate-400 font-semibold block text-[11px]">Isolated PostgreSQL Schema</span>
              <span className="font-mono text-purple-700 bg-purple-50 px-2 py-0.5 rounded border border-purple-200 font-bold">
                {onboardedResult.schema}
              </span>
            </div>
          </div>

          {/* Credentials Box */}
          <div className="p-3.5 rounded-lg bg-purple-50/70 border border-purple-200 space-y-2.5">
            <div className="flex items-center gap-2 text-purple-900 font-bold text-xs">
              <KeyRound className="w-4 h-4 text-purple-600" />
              <span>Initial Clinic Admin Login Credentials:</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
              <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-white border border-purple-100">
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Username</span>
                  <span className="font-mono font-bold text-slate-900">{onboardedResult.username}</span>
                </div>
                <button
                  onClick={() => copyToClipboard(onboardedResult.username, 'uname')}
                  className="p-1 rounded-md text-slate-400 hover:text-purple-600 hover:bg-purple-50 transition"
                  title="Copy username"
                >
                  {copiedKey === 'uname' ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>

              <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-white border border-purple-100">
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Password</span>
                  <span className="font-mono font-bold text-slate-900">{onboardedResult.password}</span>
                </div>
                <button
                  onClick={() => copyToClipboard(onboardedResult.password, 'pwd')}
                  className="p-1 rounded-md text-slate-400 hover:text-purple-600 hover:bg-purple-50 transition"
                  title="Copy password"
                >
                  {copiedKey === 'pwd' ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>

            <p className="text-[11px] text-purple-700">
              Share these credentials securely with the Clinic Doctor or Front Desk Admin.
            </p>
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-1">
            <button
              onClick={() => {
                setOnboardedResult(null);
                setClinicName('');
                setSchemaName('');
                setOwnerName('');
                setOwnerPhone('');
                setOwnerEmail('');
                setAdminUsername('');
                setAdminPassword('clinic123');
              }}
              className="ui-btn-secondary"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Onboard Another Clinic</span>
            </button>

            <button
              onClick={() => navigate('/tenants')}
              className="ui-btn-primary bg-purple-600 hover:bg-purple-700"
            >
              Return to Clinic Tenants Directory
            </button>
          </div>
        </div>
      ) : (
        /* Form Card */
        <form onSubmit={handleSubmit} className="space-y-3.5">
          {errorMessage && (
            <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2 font-semibold">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Section 1: Clinic & Schema Identity */}
          <div className="ui-card space-y-3">
            <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
              <Building2 className="w-4 h-4 text-purple-600" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-600">
                1. Clinic & Database Schema
              </h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="ui-label">
                  Clinic / Hospital Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={clinicName}
                  onChange={(e) => handleClinicNameChange(e.target.value)}
                  placeholder="e.g. Apex Multispeciality Hospital"
                  className={`ui-input ${fieldErrors.name ? 'border-rose-400 bg-rose-50' : ''}`}
                />
                {fieldErrors.name && (
                  <p className="text-[11px] text-rose-600 font-medium mt-1">{fieldErrors.name}</p>
                )}
              </div>

              <div>
                <label className="ui-label">
                  Tenant PostgreSQL Schema <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <Database className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    disabled={isEditMode}
                    value={schemaName}
                    onChange={(e) => {
                      const val = e.target.value.toLowerCase();
                      setSchemaName(val);
                      setFieldErrors((prev) => clearOrValidateField(tenantCreateSchema, 'schema_name', val.trim(), prev));
                    }}
                    placeholder="e.g. clinic_apex_hospital"
                    className={`ui-input pl-8 font-mono ${isEditMode ? 'bg-slate-100 text-slate-500 cursor-not-allowed' : fieldErrors.schema_name ? 'border-rose-400 bg-rose-50' : ''}`}
                  />
                </div>
                {fieldErrors.schema_name ? (
                  <p className="text-[11px] text-rose-600 font-medium mt-1">{fieldErrors.schema_name}</p>
                ) : (
                  <p className="text-[10px] text-slate-400 mt-1">
                    Must start with <code className="text-purple-600 font-bold">clinic_</code> or <code className="text-purple-600 font-bold">tenant_</code>
                  </p>
                )}
              </div>

              <div>
                <label className="ui-label">Tenant Status</label>
                <div className="flex items-center gap-2 h-8">
                  <button
                    type="button"
                    onClick={() => setStatus('ACTIVE')}
                    className={`h-8 px-3 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 border ${status === 'ACTIVE'
                        ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
                        : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}
                  >
                    <CheckCircle2 className={`w-3.5 h-3.5 ${status === 'ACTIVE' ? 'text-emerald-600' : 'text-slate-400'}`} />
                    <span>ACTIVE</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setStatus('SUSPENDED')}
                    className={`h-8 px-3 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 border ${status === 'SUSPENDED'
                        ? 'bg-rose-50 border-rose-300 text-rose-800'
                        : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}
                  >
                    <AlertCircle className={`w-3.5 h-3.5 ${status === 'SUSPENDED' ? 'text-rose-600' : 'text-slate-400'}`} />
                    <span>SUSPENDED</span>
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Section 2: Owner & Chief Doctor Details */}
          <div className="ui-card space-y-3">
            <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
              <Stethoscope className="w-4 h-4 text-emerald-600" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-600">
                2. Owner & Chief Doctor Details
              </h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="ui-label">Owner / Chief Doctor</label>
                <div className="relative">
                  <User className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={ownerName}
                    onChange={(e) => {
                      const val = e.target.value;
                      setOwnerName(val);
                      setFieldErrors((prev) => clearOrValidateField(isEditMode ? tenantEditSchema : tenantCreateSchema, 'owner_name', val.trim() || undefined, prev));
                    }}
                    placeholder="e.g. Dr. Rajesh Sharma"
                    className={`ui-input pl-8 ${fieldErrors.owner_name ? 'border-rose-400 bg-rose-50' : ''}`}
                  />
                </div>
                {fieldErrors.owner_name && (
                  <p className="text-[11px] text-rose-600 font-medium mt-1">{fieldErrors.owner_name}</p>
                )}
              </div>

              <div>
                <label className="ui-label">Contact Phone</label>
                <div className="relative">
                  <Phone className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={ownerPhone}
                    onChange={(e) => {
                      const val = e.target.value;
                      setOwnerPhone(val);
                      setFieldErrors((prev) => clearOrValidateField(isEditMode ? tenantEditSchema : tenantCreateSchema, 'owner_phone', val.trim() || undefined, prev));
                    }}
                    placeholder="e.g. +91 98765 43210"
                    className={`ui-input pl-8 ${fieldErrors.owner_phone ? 'border-rose-400 bg-rose-50' : ''}`}
                  />
                </div>
                {fieldErrors.owner_phone && (
                  <p className="text-[11px] text-rose-600 font-medium mt-1">{fieldErrors.owner_phone}</p>
                )}
              </div>

              <div>
                <label className="ui-label">Owner Email</label>
                <div className="relative">
                  <Mail className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="email"
                    value={ownerEmail}
                    onChange={(e) => {
                      const val = e.target.value;
                      setOwnerEmail(val);
                      setFieldErrors((prev) => clearOrValidateField(isEditMode ? tenantEditSchema : tenantCreateSchema, 'owner_email', val.trim() || undefined, prev));
                    }}
                    placeholder="e.g. contact@apexhospital.in"
                    className={`ui-input pl-8 ${fieldErrors.owner_email ? 'border-rose-400 bg-rose-50' : ''}`}
                  />
                </div>
                {fieldErrors.owner_email && (
                  <p className="text-[11px] text-rose-600 font-medium mt-1">{fieldErrors.owner_email}</p>
                )}
              </div>
            </div>
          </div>

          {/* Section 3: Initial Clinic Admin Account (Create mode only) */}
          {!isEditMode && (
            <div className="ui-card space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <KeyRound className="w-4 h-4 text-purple-600" />
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-600">
                    3. Initial Clinic Admin Account
                  </h3>
                </div>
                <span className="text-[11px] text-slate-400">Receives full CLINIC_ADMIN rights</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="ui-label">
                    Admin Username <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={adminUsername}
                    onChange={(e) => {
                      const val = e.target.value;
                      setAdminUsername(val);
                      setFieldErrors((prev) => clearOrValidateField(tenantCreateSchema, 'admin_username', val.trim(), prev));
                    }}
                    placeholder="e.g. apex_admin"
                    className={`ui-input font-mono ${fieldErrors.admin_username ? 'border-rose-400 bg-rose-50' : ''}`}
                  />
                  {fieldErrors.admin_username && (
                    <p className="text-[11px] text-rose-600 font-medium mt-1">{fieldErrors.admin_username}</p>
                  )}
                </div>

                <div>
                  <label className="ui-label">
                    Admin Password <span className="text-rose-500">*</span>
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={adminPassword}
                      onChange={(e) => {
                        const val = e.target.value;
                        setAdminPassword(val);
                        setFieldErrors((prev) => clearOrValidateField(tenantCreateSchema, 'admin_password', val.trim(), prev));
                      }}
                      placeholder="Default: clinic123"
                      className={`ui-input pr-9 font-mono ${fieldErrors.admin_password ? 'border-rose-400 bg-rose-50' : ''}`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    >
                      {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                  {fieldErrors.admin_password && (
                    <p className="text-[11px] text-rose-600 font-medium mt-1">{fieldErrors.admin_password}</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Form Actions */}
          <div className="flex items-center justify-end gap-2.5 pt-1">
            <Link to="/tenants" className="ui-btn-secondary">
              Cancel
            </Link>

            <button
              type="submit"
              disabled={saving}
              className="ui-btn-primary bg-purple-600 hover:bg-purple-700"
            >
              {saving ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Provisioning Schema...</span>
                </>
              ) : (
                <>
                  <Save className="w-3.5 h-3.5" />
                  <span>{isEditMode ? 'Save Changes' : 'Provision Isolated Tenant'}</span>
                </>
              )}
            </button>
          </div>
        </form>
      )}
    </div>
  );
};
