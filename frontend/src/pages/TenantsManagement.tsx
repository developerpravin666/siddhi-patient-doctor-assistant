import React, { useState, useEffect, useMemo } from 'react';
import { Building2, Plus, CheckCircle2, XCircle, AlertCircle, Database, Stethoscope } from 'lucide-react';
import { getTenants, createTenant, updateTenant } from '../api/client';
import { Tenant } from '../types';
import { DataTable, ColumnDef } from '../components/DataTable';

export const TenantsManagement: React.FC = () => {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  
  // Form fields
  const [clinicName, setClinicName] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [ownerPhone, setOwnerPhone] = useState('');
  const [ownerEmail, setOwnerEmail] = useState('');
  const [adminUsername, setAdminUsername] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [schemaName, setSchemaName] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [createdTenantInfo, setCreatedTenantInfo] = useState<{
    name: string;
    schema: string;
    username: string;
    password: string;
  } | null>(null);

  const loadTenants = async () => {
    try {
      setLoading(true);
      const data = await getTenants();
      setTenants(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTenants();
  }, []);

  const handleClinicNameChange = (name: string) => {
    setClinicName(name);
    // Auto-slug schema name: e.g. "Apex Healthcare" -> "clinic_apex_healthcare"
    const slug = name
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '_')
      .replace(/_+/g, '_')
      .slice(0, 50);
    setSchemaName(slug ? `clinic_${slug}` : '');
    if (!adminUsername) {
      setAdminUsername(slug ? `${slug.slice(0, 15)}_admin` : '');
    }
  };

  const handleCreateTenant = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clinicName.trim()) return;

    try {
      setErrorMessage('');
      const pwd = adminPassword.trim() || 'clinic123';
      const uname = adminUsername.trim() || `${schemaName.replace('clinic_', '')}_admin`;

      const result = await createTenant({
        name: clinicName.trim(),
        schema_name: schemaName.trim() || undefined,
        owner_name: ownerName.trim() || undefined,
        owner_phone: ownerPhone.trim() || undefined,
        owner_email: ownerEmail.trim() || undefined,
        admin_username: uname,
        admin_password: pwd,
        status: 'ACTIVE',
      });

      setCreatedTenantInfo({
        name: result.name,
        schema: result.schema_name,
        username: uname,
        password: pwd,
      });

      setIsModalOpen(false);
      setClinicName('');
      setOwnerName('');
      setOwnerPhone('');
      setOwnerEmail('');
      setAdminUsername('');
      setAdminPassword('');
      setSchemaName('');
      loadTenants();
    } catch (err: any) {
      setErrorMessage(err.response?.data?.detail || 'Failed to provision clinic tenant schema');
    }
  };

  const handleToggleStatus = async (tenant: Tenant) => {
    const nextStatus = tenant.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';
    try {
      await updateTenant(tenant.id, { status: nextStatus });
      loadTenants();
    } catch (err) {
      console.error(err);
    }
  };

  const columns: ColumnDef<Tenant>[] = useMemo(() => [
    {
      key: 'name',
      header: 'Clinic Tenant',
      sortable: true,
      sortValue: (t: Tenant) => t.name,
      searchValue: (t: Tenant) => `${t.name} ${t.id}`,
      render: (tenant: Tenant) => (
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-purple-50 border border-purple-100 flex items-center justify-center text-purple-700 shrink-0 font-bold">
            <Building2 className="w-4 h-4" />
          </div>
          <div>
            <div className="font-bold text-slate-900 text-sm">{tenant.name}</div>
            <div className="text-slate-400 text-[10px] font-mono">{tenant.id}</div>
          </div>
        </div>
      )
    },
    {
      key: 'schema_name',
      header: 'PostgreSQL Schema',
      sortable: true,
      sortValue: (t: Tenant) => t.schema_name || '',
      searchValue: (t: Tenant) => t.schema_name || '',
      render: (tenant: Tenant) => (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-mono font-semibold bg-slate-100 text-slate-800 border border-slate-200">
          <Database className="w-3 h-3 text-purple-600" />
          <span>{tenant.schema_name || 'clinic_default'}</span>
        </span>
      )
    },
    {
      key: 'owner_name',
      header: 'Clinic Doctor / Owner',
      sortable: true,
      sortValue: (t: Tenant) => t.owner_name || '',
      searchValue: (t: Tenant) => `${t.owner_name || ''} ${t.owner_phone || ''}`,
      render: (tenant: Tenant) => (
        <div>
          <div className="font-semibold text-slate-800 flex items-center gap-1">
            <Stethoscope className="w-3 h-3 text-emerald-600" />
            <span>{tenant.owner_name || 'Dr. Siddhi Patel'}</span>
          </div>
          <div className="text-slate-400 text-[11px] mt-0.5">
            {tenant.owner_phone || '+91 98765 00000'}
          </div>
        </div>
      )
    },
    {
      key: 'status',
      header: 'Status',
      sortable: true,
      sortValue: (t: Tenant) => t.status,
      render: (tenant: Tenant) => (
        <span
          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold ${
            tenant.status === 'ACTIVE'
              ? 'bg-emerald-100 text-emerald-800'
              : 'bg-rose-100 text-rose-800'
          }`}
        >
          {tenant.status === 'ACTIVE' ? (
            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
          ) : (
            <XCircle className="w-3 h-3 text-rose-600" />
          )}
          <span>{tenant.status}</span>
        </span>
      )
    },
    {
      key: 'created_at',
      header: 'Onboarded',
      sortable: true,
      sortValue: (t: Tenant) => t.created_at,
      render: (tenant: Tenant) => (
        <span className="text-slate-500 font-mono text-[11px]">
          {new Date(tenant.created_at).toLocaleDateString()}
        </span>
      )
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (tenant: Tenant) => (
        <button
          onClick={() => handleToggleStatus(tenant)}
          className={`px-3 py-1 rounded-lg text-xs font-bold border transition ${
            tenant.status === 'ACTIVE'
              ? 'border-rose-200 text-rose-700 hover:bg-rose-50'
              : 'border-emerald-200 text-emerald-700 hover:bg-emerald-50'
          }`}
        >
          {tenant.status === 'ACTIVE' ? 'Suspend' : 'Activate'}
        </button>
      )
    }
  ], []);

  return (
    <div className="space-y-6">
      {createdTenantInfo && (
        <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-950 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-600" />
              <span className="font-bold text-sm">Clinic Tenant Onboarded Successfully!</span>
            </div>
            <p className="text-xs text-emerald-800">
              Clinic: <span className="font-semibold">{createdTenantInfo.name}</span> | Isolated Schema: <code className="bg-emerald-100 px-1.5 py-0.5 rounded font-mono text-[11px]">{createdTenantInfo.schema}</code>
            </p>
            <p className="text-xs text-emerald-900 mt-1">
              🔑 <strong>Clinic Admin Login Credentials:</strong> Username: <code className="bg-white px-2 py-0.5 rounded border border-emerald-300 font-mono font-bold text-slate-800">{createdTenantInfo.username}</code> | Password: <code className="bg-white px-2 py-0.5 rounded border border-emerald-300 font-mono font-bold text-slate-800">{createdTenantInfo.password}</code>
            </p>
            <p className="text-[11px] text-emerald-700">
              The Doctor / Clinic Admin can now log in, add clinic doctors with consultation intervals, and onboard front desk staff.
            </p>
          </div>
          <button
            onClick={() => setCreatedTenantInfo(null)}
            className="text-xs font-bold text-emerald-700 hover:text-emerald-900 bg-emerald-100 hover:bg-emerald-200 px-3 py-1.5 rounded-xl transition shrink-0"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Shared DataTable */}
      <DataTable<Tenant>
        title={
          <div className="flex items-center gap-2">
            <span>Clinic Tenants (Schema-Per-Tenant)</span>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 text-purple-800">
              Super Admin
            </span>
          </div>
        }
        subtitle="Each clinic operates as an independent tenant with its own dedicated, isolated PostgreSQL schema."
        data={tenants}
        columns={columns}
        keyExtractor={(t) => t.id}
        loading={loading}
        searchPlaceholder="Search by clinic name, doctor, or schema..."
        actionButton={
          <button
            onClick={() => {
              setIsModalOpen(true);
              setErrorMessage('');
            }}
            className="px-4 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-sm transition shadow-sm flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            <span>Onboard New Clinic Tenant</span>
          </button>
        }
        emptyMessage="No clinic tenants found."
        defaultPageSize={10}
        initialSortKey="created_at"
        initialSortDir="desc"
      />

      {/* Modal: Onboard New Clinic Tenant */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 sm:p-8 shadow-2xl space-y-5 border border-slate-100">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="font-extrabold text-slate-900 text-lg flex items-center gap-2">
                  <Building2 className="w-5 h-5 text-purple-600" />
                  <span>Onboard New Clinic Tenant</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Provisions a dedicated, isolated PostgreSQL schema with independent clinical data.
                </p>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 text-sm font-bold w-7 h-7 rounded-full flex items-center justify-center hover:bg-slate-100"
              >
                ✕
              </button>
            </div>

            {errorMessage && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}

            <form onSubmit={handleCreateTenant} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Clinic / Hospital Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Apex Multispeciality Hospital"
                  value={clinicName}
                  onChange={(e) => handleClinicNameChange(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Tenant Schema Name <span className="text-slate-400 font-normal">(Auto-generated or custom)</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. clinic_apex_hospital"
                  value={schemaName}
                  onChange={(e) => setSchemaName(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-xs font-mono bg-slate-50 focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 outline-none"
                />
                <p className="text-[10px] text-slate-400 mt-0.5">
                  This isolated schema will be created via DDL and contain this clinic's appointments, doctors, and patients.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Owner / Chief Doctor</label>
                  <input
                    type="text"
                    placeholder="e.g. Dr. Rajesh Sharma"
                    value={ownerName}
                    onChange={(e) => setOwnerName(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Owner Contact Phone</label>
                  <input
                    type="text"
                    placeholder="e.g. +91 98765 43210"
                    value={ownerPhone}
                    onChange={(e) => setOwnerPhone(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Owner Email</label>
                <input
                  type="email"
                  placeholder="e.g. contact@apexhospital.in"
                  value={ownerEmail}
                  onChange={(e) => setOwnerEmail(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 outline-none"
                />
              </div>

              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                <div className="text-[11px] font-bold text-slate-700">Initial Clinic Admin Account:</div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[10px] font-semibold text-slate-500 mb-0.5">Admin Username</label>
                    <input
                      type="text"
                      placeholder="e.g. apex_admin"
                      value={adminUsername}
                      onChange={(e) => setAdminUsername(e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs font-mono bg-white outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-semibold text-slate-500 mb-0.5">Admin Password</label>
                    <input
                      type="password"
                      placeholder="Default: clinic123"
                      value={adminPassword}
                      onChange={(e) => setAdminPassword(e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs font-mono bg-white outline-none"
                    />
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl text-xs font-bold bg-purple-600 hover:bg-purple-700 text-white shadow-sm transition"
                >
                  Provision Isolated Tenant
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
