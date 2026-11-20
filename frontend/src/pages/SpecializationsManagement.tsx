import React, { useState, useEffect } from 'react';
import { 
  Plus, 
  Stethoscope, 
  Edit3, 
  Trash2, 
  CheckCircle, 
  XCircle, 
  AlertCircle, 
  Sparkles,
  Layers
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
import { DataTable, ColumnDef } from '../components/DataTable';
import { useConfirm } from '../context/ConfirmationContext';

const specializationSchema = z.object({
  name: z.string().trim().min(2, 'Specialization name must be at least 2 characters').max(100, 'Name must not exceed 100 characters'),
  description: z.string().trim().max(255, 'Description cannot exceed 255 characters').optional(),
  is_active: z.boolean().default(true),
});

type SpecializationFormData = z.infer<typeof specializationSchema>;

export const SpecializationsManagement: React.FC = () => {
  const [specializations, setSpecializations] = useState<Specialization[]>([]);
  const [loading, setLoading] = useState(true);
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
  const confirm = useConfirm();

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
        await createSpecialization({
          name: formData.name.trim(),
          description: formData.description?.trim() || undefined,
          is_active: formData.is_active,
        });
        setSuccessMessage(`Specialization "${formData.name.trim()}" created successfully!`);
      } else if (editItem) {
        await updateSpecialization(editItem.id, {
          name: formData.name.trim(),
          description: formData.description?.trim() || undefined,
          is_active: formData.is_active,
        });
        setSuccessMessage(`Specialization "${formData.name.trim()}" updated successfully!`);
      }
      closeForm();
      await loadData();
      setTimeout(() => setSuccessMessage(''), 4000);
    } catch (err: any) {
      setErrorMessage(err.response?.data?.detail || 'Failed to save specialization.');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleStatus = async (item: Specialization) => {
    try {
      await toggleSpecializationStatus(item.id, !item.is_active);
      setSuccessMessage(`Specialization "${item.name}" is now ${!item.is_active ? 'Active' : 'Inactive'}.`);
      await loadData();
      setTimeout(() => setSuccessMessage(''), 3000);
    } catch (err: any) {
      setErrorMessage(err.response?.data?.detail || 'Failed to update specialization status');
    }
  };

  const handleDelete = async (item: Specialization) => {
    const ok = await confirm({
      title: 'Delete Master Specialization',
      message: `Are you sure you want to permanently delete "${item.name}" from the master directory?`,
      description: '⚠️ Physicians currently assigned to this specialization may need their profiles updated.',
      confirmText: 'Delete Specialization',
      cancelText: 'Keep Specialization',
      variant: 'danger',
    });
    if (!ok) return;

    try {
      await deleteSpecialization(item.id);
      setSuccessMessage(`Specialization "${item.name}" deleted successfully.`);
      await loadData();
      setTimeout(() => setSuccessMessage(''), 3000);
    } catch (err: any) {
      setErrorMessage(err.response?.data?.detail || 'Failed to delete specialization');
    }
  };

  // Define Columns for DataTable
  const columns: ColumnDef<Specialization>[] = [
    {
      key: 'name',
      header: 'Specialization',
      sortable: true,
      searchValue: (s) => `${s.name} ${s.description || ''}`,
      render: (spec) => (
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold text-xs shadow-inner">
            {spec.name.slice(0, 2).toUpperCase()}
          </div>
          <div>
            <span className="font-semibold text-slate-900 text-xs sm:text-sm">{spec.name}</span>
          </div>
        </div>
      ),
    },
    {
      key: 'description',
      header: 'Scope of Medical Care & Treatments',
      sortable: true,
      render: (spec) => (
        <p className="text-slate-600 text-xs max-w-md line-clamp-2">
          {spec.description || <span className="text-slate-400 italic">No description provided</span>}
        </p>
      ),
    },
    {
      key: 'is_active',
      header: 'Status',
      sortable: true,
      render: (spec) => (
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
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      sortable: false,
      align: 'right',
      render: (spec) => (
        <div className="inline-flex items-center gap-1.5">
          <button
            onClick={() => openEditForm(spec)}
            className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg border border-transparent hover:border-indigo-200 transition"
            title="Edit Specialization"
          >
            <Edit3 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => handleDelete(spec)}
            className="p-1.5 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-lg border border-transparent hover:border-rose-200 transition"
            title="Delete Specialization"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="p-1.5 rounded-lg bg-indigo-50 text-indigo-600">
              <Stethoscope className="w-4 h-4" />
            </span>
            <span className="text-xs font-bold text-indigo-600 uppercase tracking-wider">Master Catalog</span>
          </div>
          <h2 className="text-xl font-bold text-slate-900">Medical Specializations</h2>
          <p className="text-xs text-slate-500">
            Define standardized clinical specialties for doctor profiles and multi-specialty scheduling
          </p>
        </div>

        {editItem === null && (
          <button
            onClick={openNewForm}
            className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-sm transition"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Specialization</span>
          </button>
        )}
      </div>

      {/* Alerts */}
      {successMessage && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-emerald-600 flex-shrink-0" />
            <span>{successMessage}</span>
          </div>
          <button onClick={() => setSuccessMessage('')} className="text-emerald-500 hover:text-emerald-800 font-bold">×</button>
        </div>
      )}

      {errorMessage && (
        <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0" />
            <span>{errorMessage}</span>
          </div>
          <button onClick={() => setErrorMessage('')} className="text-rose-500 hover:text-rose-800 font-bold">×</button>
        </div>
      )}

      {/* Form Card (Adding or Editing) */}
      {editItem !== null && (
        <div className="bg-white border border-indigo-200 rounded-2xl p-5 shadow-sm space-y-4 animate-fade-in">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2">
              <Layers className="w-4 h-4 text-indigo-600" />
              <span>{editItem === 'new' ? 'New Medical Specialization' : `Edit Specialization: ${editItem.name}`}</span>
            </h3>
            <button
              onClick={closeForm}
              className="text-xs font-medium text-slate-400 hover:text-slate-600"
            >
              Cancel
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Specialization Title <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g., Cardiologist, Pediatrician, Neurologist"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className={`w-full px-3.5 py-2 rounded-xl border ${
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
                  <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-slate-700">
                    <input
                      type="radio"
                      name="is_active"
                      checked={formData.is_active === true}
                      onChange={() => setFormData({ ...formData, is_active: true })}
                      className="text-indigo-600 focus:ring-indigo-500"
                    />
                    Active (Available for Doctors)
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-slate-700">
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
                className="px-4 py-2 border border-slate-300 text-slate-700 rounded-xl text-xs font-medium hover:bg-slate-50 transition"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-5 py-2 bg-indigo-600 text-white rounded-xl text-xs font-bold hover:bg-indigo-700 transition disabled:opacity-50"
              >
                {saving ? 'Saving...' : editItem === 'new' ? 'Save Specialization' : 'Update Specialization'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Main Specializations Grid with Sorting, Searching & Pagination */}
      <DataTable<Specialization>
        data={specializations}
        columns={columns}
        loading={loading}
        searchPlaceholder="Search specializations..."
        emptyMessage="No specializations found in catalog."
        defaultPageSize={10}
        initialSortKey="name"
      />
    </div>
  );
};
