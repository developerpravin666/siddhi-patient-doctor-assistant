import React, { useState, useEffect } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import {
  Users,
  ArrowLeft,
  User,
  Phone,
  Mail,
  MapPin,
  AlertCircle,
  Save
} from 'lucide-react';
import { z } from 'zod';
import { getPatient, createPatient, updatePatient } from '../api/client';
import { Patient } from '../types';
import { SearchableSelect } from '../components/SearchableSelect';

const patientSchema = z.object({
  full_name: z.string().trim().min(2, 'Full Name must be at least 2 characters').max(100, 'Full Name cannot exceed 100 characters'),
  mobile_number: z.string().trim()
    .min(10, 'Mobile number must be at least 10 digits')
    .max(15, 'Mobile number cannot exceed 15 digits')
    .regex(/^[0-9+\s-]+$/, 'Mobile number can only contain digits, spaces, and hyphens'),
  email: z.string().trim().email('Please enter a valid email address').optional().or(z.literal('')),
  gender: z.enum(['MALE', 'FEMALE', 'OTHER', '']).optional(),
  age: z.number().int().min(1, 'Age must be between 1 and 120').max(120, 'Age must be between 1 and 120').optional().nullable(),
  address: z.string().trim().max(255, 'Address cannot exceed 255 characters').optional().or(z.literal('')),
  status: z.enum(['ACTIVE', 'INACTIVE']).default('ACTIVE'),
});

export const PatientForm: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const isEditMode = Boolean(id);
  const navigate = useNavigate();

  const [loading, setLoading] = useState(isEditMode);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  const [formData, setFormData] = useState<{
    full_name: string;
    mobile_number: string;
    email: string;
    gender: 'MALE' | 'FEMALE' | 'OTHER' | '';
    age: string;
    address: string;
    status: 'ACTIVE' | 'INACTIVE';
  }>({
    full_name: '',
    mobile_number: '',
    email: '',
    gender: '',
    age: '',
    address: '',
    status: 'ACTIVE',
  });

  useEffect(() => {
    if (isEditMode && id) {
      const fetchPatient = async () => {
        try {
          setLoading(true);
          const pt = await getPatient(id);
          setFormData({
            full_name: pt.full_name,
            mobile_number: pt.mobile_number,
            email: pt.email || '',
            gender: (pt.gender as any) || '',
            age: pt.age ? pt.age.toString() : '',
            address: pt.address || '',
            status: pt.status || 'ACTIVE',
          });
        } catch (err: any) {
          setErrorMessage(err.response?.data?.detail || 'Failed to load patient record.');
        } finally {
          setLoading(false);
        }
      };
      fetchPatient();
    }
  }, [id, isEditMode]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormErrors({});
    setErrorMessage('');

    const parsedAge = formData.age ? parseInt(formData.age, 10) : undefined;

    const validation = patientSchema.safeParse({
      ...formData,
      age: isNaN(parsedAge as any) ? undefined : parsedAge,
      gender: formData.gender || undefined,
      email: formData.email || undefined,
      address: formData.address || undefined,
    });

    if (!validation.success) {
      const fieldErrors: Record<string, string> = {};
      validation.error.issues.forEach((issue) => {
        if (issue.path[0]) {
          fieldErrors[issue.path[0].toString()] = issue.message;
        }
      });
      setFormErrors(fieldErrors);
      return;
    }

    try {
      setSaving(true);
      const payload: Partial<Patient> = {
        full_name: formData.full_name.trim(),
        mobile_number: formData.mobile_number.trim(),
        email: formData.email.trim() || undefined,
        gender: formData.gender || undefined,
        age: parsedAge,
        address: formData.address.trim() || undefined,
        status: formData.status,
        is_active: formData.status === 'ACTIVE',
      };

      if (isEditMode && id) {
        await updatePatient(id, payload);
      } else {
        await createPatient(payload);
      }

      navigate('/patients');
    } catch (err: any) {
      setErrorMessage(err.response?.data?.detail || 'Failed to save patient record.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="p-12 text-center text-slate-500">
        <Users className="w-8 h-8 animate-spin mx-auto mb-2 text-indigo-600" />
        <p>Loading patient details...</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Top Header */}
      <div className="flex items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div className="flex items-center gap-3">
          <Link
            to="/patients"
            className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition"
            title="Back to Patients Directory"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <span className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
                <Users className="w-5 h-5" />
              </span>
              <h1 className="text-2xl font-bold text-slate-900">
                {isEditMode ? 'Edit Patient Profile' : 'Add New Patient'}
              </h1>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Maintain accurate patient demographics, contact details, and active status.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => navigate('/patients')}
          className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800 border border-slate-200 rounded-xl hover:bg-slate-50 transition"
        >
          Cancel
        </button>
      </div>

      {/* Error Alert */}
      {errorMessage && (
        <div className="p-4 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-sm flex items-center gap-2.5">
          <AlertCircle className="w-5 h-5 text-rose-600 flex-shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Form */}
      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-5">
          <h2 className="text-base font-bold text-slate-800 flex items-center gap-2 pb-3 border-b border-slate-100">
            <User className="w-4 h-4 text-indigo-600" />
            Personal & Contact Information
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Full Name <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="e.g. Test Patient"
                  value={formData.full_name}
                  onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                  className={`w-full pl-10 pr-4 py-2.5 rounded-xl border ${formErrors.full_name ? 'border-rose-400 bg-rose-50' : 'border-slate-300'
                    } text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500`}
                />
              </div>
              {formErrors.full_name && (
                <p className="text-xs text-rose-600 mt-1 font-medium">{formErrors.full_name}</p>
              )}
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Mobile Number <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <Phone className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="e.g. 9876543210"
                  value={formData.mobile_number}
                  onChange={(e) => setFormData({ ...formData, mobile_number: e.target.value })}
                  className={`w-full pl-10 pr-4 py-2.5 rounded-xl border ${formErrors.mobile_number ? 'border-rose-400 bg-rose-50' : 'border-slate-300'
                    } text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500`}
                />
              </div>
              {formErrors.mobile_number && (
                <p className="text-xs text-rose-600 mt-1 font-medium">{formErrors.mobile_number}</p>
              )}
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Email Address <span className="text-slate-400 text-xs font-normal">(Optional)</span>
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="email"
                  placeholder="e.g. test@gmail.com"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className={`w-full pl-10 pr-4 py-2.5 rounded-xl border ${formErrors.email ? 'border-rose-400 bg-rose-50' : 'border-slate-300'
                    } text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500`}
                />
              </div>
              {formErrors.email && (
                <p className="text-xs text-rose-600 mt-1 font-medium">{formErrors.email}</p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Gender
                </label>
                <SearchableSelect
                  placeholder="Select Gender"
                  value={formData.gender || ''}
                  onChange={(val) => setFormData({ ...formData, gender: (val || '') as any })}
                  searchable={false}
                  options={[
                    { value: '', label: 'Select' },
                    { value: 'MALE', label: 'Male' },
                    { value: 'FEMALE', label: 'Female' },
                    { value: 'OTHER', label: 'Other' },
                  ]}
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Age
                </label>
                <input
                  type="number"
                  min={1}
                  max={120}
                  placeholder="Years"
                  value={formData.age}
                  onChange={(e) => setFormData({ ...formData, age: e.target.value })}
                  className={`w-full px-3.5 py-2.5 rounded-xl border ${formErrors.age ? 'border-rose-400 bg-rose-50' : 'border-slate-300'
                    } text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500`}
                />
                {formErrors.age && (
                  <p className="text-xs text-rose-600 mt-1 font-medium">{formErrors.age}</p>
                )}
              </div>
            </div>

            <div className="md:col-span-2">
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Residential Address <span className="text-slate-400 text-xs font-normal">(Optional)</span>
              </label>
              <div className="relative">
                <MapPin className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                <textarea
                  rows={2}
                  placeholder="Street, locality, city, pincode..."
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>

            <div className="md:col-span-2 pt-2 border-t border-slate-100">
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Patient Status
              </label>
              <div className="flex items-center gap-6">
                <label className="flex items-center gap-2 cursor-pointer text-sm font-medium text-slate-700">
                  <input
                    type="radio"
                    name="status"
                    checked={formData.status === 'ACTIVE'}
                    onChange={() => setFormData({ ...formData, status: 'ACTIVE' })}
                    className="text-indigo-600 focus:ring-indigo-500"
                  />
                  Active Patient
                </label>
                <label className="flex items-center gap-2 cursor-pointer text-sm font-medium text-slate-700">
                  <input
                    type="radio"
                    name="status"
                    checked={formData.status === 'INACTIVE'}
                    onChange={() => setFormData({ ...formData, status: 'INACTIVE' })}
                    className="text-indigo-600 focus:ring-indigo-500"
                  />
                  Inactive / Archived
                </label>
              </div>
            </div>
          </div>
        </div>

        {/* Form Actions */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={() => navigate('/patients')}
            className="px-5 py-2.5 border border-slate-300 text-slate-700 rounded-xl text-sm font-semibold hover:bg-slate-50 transition"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-2 px-6 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 transition shadow-sm hover:shadow disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            {saving ? 'Saving...' : isEditMode ? 'Update Patient' : 'Register Patient'}
          </button>
        </div>
      </form>
    </div>
  );
};
