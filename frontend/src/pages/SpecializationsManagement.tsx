import React, { useState, useEffect } from 'react';
import { 
  Plus, 
  Stethoscope, 
  Search, 
  Edit3, 
  Trash2, 
  CheckCircle, 
  XCircle, 
  AlertCircle, 
  Activity,
  Layers,
  Sparkles
} from 'lucide-react';
import { z } from 'zod';
import { 
  getSpecializations, 
  createSpecialization, 
  updateSpecialization, 
  toggleSpecializationStatus, 
  deleteSpecialization 
} from '../api/client';
import { Specialization } from '../types';

const specializationSchema = z.object({
  name: z.string().trim().min(2, 'Specialization name must be at least 2 characters').max(100, 'Name must not exceed 100 characters'),
  description: z.string().trim().max(255, 'Description cannot exceed 255 characters').optional(),
  is_active: z.boolean().default(true),
});

type SpecializationFormData = z.infer<typeof specializationSchema>;

export const SpecializationsManagement: React.FC = () => {
  const [specializations, setSpecializations] = useState<Specialization[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  // Form mode: null (closed), 'new' (creating), or Specialization (editing)
  const [editItem, setEditItem] = useState<Specialization | null | 'new'>(null);
  const [formData, setFormData] = useState<SpecializationFormData>({
    name: '',
    description: '',
    is_active: true,
  });
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const loadData = async () => {
    try {
      setLoading(true);
      setErrorMessage('');
      const data = await getSpecializations();
      setSpecializations(data);
    } catch (err: any) {
      setErrorMessage(err.response?.data?.detail || 'Failed to load specializations');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const openNewForm = () => {
    setEditItem('new');
    setFormData({ name: '', description: '', is_active: true });
    setFormErrors({});
    setErrorMessage('');
  };

  const openEditForm = (item: Specialization) => {
    setEditItem(item);
    setFormData({
      name: item.name,
      description: item.description || '',
      is_active: item.is_active,
    });
    setFormErrors({});
    setErrorMessage('');
  };

  const closeForm = () => {
    setEditItem(null);
    setFormData({ name: '', description: '', is_active: true });
    setFormErrors({});
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormErrors({});
    setErrorMessage('');

    // Zod validation
    const result = specializationSchema.safeParse(formData);
    if (!result.success) {
      const fieldErrors: Record<string, string> = {};
      result.error.issues.forEach((issue) => {
        if (issue.path[0]) {
          fieldErrors[issue.path[0].toString()] = issue.message;
        }
      });
      setFormErrors(fieldErrors);
      return;
    }

    try {
      setSaving(true);
      if (editItem === 'new') {
        await createSpecialization(result.data);
        setSuccessMessage('Specialization created successfully!');
      } else if (editItem && typeof editItem === 'object') {
        await updateSpecialization(editItem.id, result.data);
        setSuccessMessage('Specialization updated successfully!');
      }
      setTimeout(() => setSuccessMessage(''), 4000);
      closeForm();
      await loadData();
    } catch (err: any) {
      setErrorMessage(err.response?.data?.detail || 'Failed to save specialization');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleStatus = async (item: Specialization) => {
    try {
      await toggleSpecializationStatus(item.id, !item.is_active);
      await loadData();
    } catch (err: any) {
      setErrorMessage(err.response?.data?.detail || 'Failed to update status');
    }
  };

  const handleDelete = async (item: Specialization) => {
    if (!window.confirm(`Are you sure you want to delete "${item.name}"? Doctors assigned to this specialty will not be deleted.`)) {
      return;
    }
    try {
      await deleteSpecialization(item.id);
      setSuccessMessage(`Specialization "${item.name}" deleted successfully.`);
      setTimeout(() => setSuccessMessage(''), 4000);
      await loadData();
    } catch (err: any) {
      setErrorMessage(err.response?.data?.detail || 'Failed to delete specialization');
    }
  };

  const filteredSpecializations = specializations.filter((s) =>
    s.name.toLowerCase().includes(search.toLowerCase()) ||
    (s.description && s.description.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-5 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
              <Stethoscope className="w-6 h-6" />
            </span>
            <h1 className="text-2xl font-bold text-slate-900">Doctor Specializations Master</h1>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Central master catalog of medical specialties used when creating doctor profiles and configuring schedules.
          </p>
        </div>

        <button
          onClick={openNewForm}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 transition shadow-sm hover:shadow"
        >
          <Plus className="w-4 h-4" />
          Add Specialization
        </button>
      </div>

      {/* Notifications */}
      {successMessage && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-sm flex items-center gap-2">
          <CheckCircle className="w-5 h-5 text-emerald-600 flex-shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}

      {errorMessage && (
        <div className="p-4 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-sm flex items-center gap-2">
          <AlertCircle className="w-5 h-5 text-rose-600 flex-shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Add / Edit Form Card */}
      {editItem !== null && (
        <div className="bg-white border-2 border-indigo-200 rounded-2xl p-6 shadow-sm">
          <div className="flex items-center justify-between pb-4 mb-4 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-indigo-600" />
              <h2 className="text-lg font-bold text-slate-900">
                {editItem === 'new' ? 'Add New Medical Specialization' : `Edit Specialization: ${typeof editItem === 'object' ? editItem.name : ''}`}
              </h2>
            </div>
            <button
              onClick={closeForm}
              className="text-slate-400 hover:text-slate-600 text-sm font-medium"
            >
              Cancel
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Specialization Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. Cardiologist, Dentist, ENT Specialist"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className={`w-full px-3.5 py-2.5 rounded-xl border ${
                    formErrors.name ? 'border-rose-400 bg-rose-50' : 'border-slate-300'
                  } text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500`}
                />
                {formErrors.name && (
                  <p className="text-xs text-rose-600 mt-1 font-medium">{formErrors.name}</p>
                )}
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Status
                </label>
                <div className="flex items-center gap-4 pt-2">
                  <label className="flex items-center gap-2 cursor-pointer text-sm font-medium text-slate-700">
                    <input
                      type="radio"
                      name="is_active"
                      checked={formData.is_active === true}
                      onChange={() => setFormData({ ...formData, is_active: true })}
                      className="text-indigo-600 focus:ring-indigo-500"
                    />
                    Active (Available for Doctors)
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer text-sm font-medium text-slate-700">
                    <input
                      type="radio"
                      name="is_active"
                      checked={formData.is_active === false}
                      onChange={() => setFormData({ ...formData, is_active: false })}
                      className="text-indigo-600 focus:ring-indigo-500"
                    />
                    Inactive
                  </label>
                </div>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                Description & Scope of Care
              </label>
              <textarea
                rows={2}
                placeholder="Brief description of treatments and patient care covered by this specialty..."
                value={formData.description || ''}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className={`w-full px-3.5 py-2 rounded-xl border ${
                  formErrors.description ? 'border-rose-400 bg-rose-50' : 'border-slate-300'
                } text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500`}
              />
              {formErrors.description && (
                <p className="text-xs text-rose-600 mt-1 font-medium">{formErrors.description}</p>
              )}
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={closeForm}
                className="px-4 py-2 border border-slate-300 text-slate-700 rounded-xl text-sm font-medium hover:bg-slate-50 transition"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-5 py-2 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 transition disabled:opacity-50"
              >
                {saving ? 'Saving...' : editItem === 'new' ? 'Save Specialization' : 'Update Specialization'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Search & Filter Bar */}
      <div className="flex items-center justify-between gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search specializations..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        <div className="text-xs text-slate-500 font-medium">
          Showing {filteredSpecializations.length} of {specializations.length} specializations
        </div>
      </div>

      {/* Specializations Table */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-400 text-sm">
            <Activity className="w-8 h-8 animate-spin mx-auto mb-2 text-indigo-500" />
            Loading specializations catalog...
          </div>
        ) : filteredSpecializations.length === 0 ? (
          <div className="p-12 text-center text-slate-500">
            <Layers className="w-10 h-10 text-slate-300 mx-auto mb-2" />
            <p className="font-semibold text-slate-700">No specializations found</p>
            <p className="text-xs text-slate-400 mt-1">
              {search ? 'Try modifying your search criteria' : 'Click "Add Specialization" above to register new specialties.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-600">
              <thead className="bg-slate-50/75 border-b border-slate-200 text-xs font-bold text-slate-500 uppercase tracking-wider">
                <tr>
                  <th className="px-6 py-3.5">Specialization</th>
                  <th className="px-6 py-3.5">Description</th>
                  <th className="px-6 py-3.5">Status</th>
                  <th className="px-6 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredSpecializations.map((spec) => (
                  <tr key={spec.id} className="hover:bg-slate-50/50 transition">
                    <td className="px-6 py-4 font-semibold text-slate-900">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold text-xs">
                          {spec.name.slice(0, 2).toUpperCase()}
                        </div>
                        <span>{spec.name}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-slate-600 text-xs max-w-md">
                      {spec.description || <span className="text-slate-400 italic">No description provided</span>}
                    </td>
                    <td className="px-6 py-4">
                      <button
                        onClick={() => handleToggleStatus(spec)}
                        title="Click to toggle Active / Inactive status"
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold cursor-pointer transition ${
                          spec.is_active
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100'
                            : 'bg-slate-100 text-slate-600 border border-slate-200 hover:bg-slate-200'
                        }`}
                      >
                        {spec.is_active ? (
                          <>
                            <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
                            Active
                          </>
                        ) : (
                          <>
                            <XCircle className="w-3.5 h-3.5 text-slate-400" />
                            Inactive
                          </>
                        )}
                      </button>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="inline-flex items-center gap-2">
                        <button
                          onClick={() => openEditForm(spec)}
                          className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition"
                          title="Edit Specialization"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(spec)}
                          className="p-1.5 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition"
                          title="Delete Specialization"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
