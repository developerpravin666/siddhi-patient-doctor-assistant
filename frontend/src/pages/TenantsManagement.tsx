import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2, Plus, CheckCircle2, XCircle, Stethoscope, Edit3, Database } from 'lucide-react';
import { getTenants, updateTenant } from '../api/client';
import { Tenant } from '../types';
import { DataTable, ColumnDef } from '../components/DataTable';
import { useConfirm } from '../context/ConfirmationContext';

export const TenantsManagement: React.FC<{ defaultMode?: 'server' | 'client' }> = (props) => {
  const navigate = useNavigate();
  const [gridMode] = useState<'server' | 'client'>(props.defaultMode || 'server');

  const [page, setPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(10);
  const [sortKey, setSortKey] = useState<string | null>('created_at');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [totalCount, setTotalCount] = useState<number>(0);

  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const confirm = useConfirm();

  const loadTenants = useCallback(async (overrides?: {
    search?: string;
    sortKey?: string | null;
    sortDir?: 'asc' | 'desc';
    page?: number;
    pageSize?: number;
    mode?: 'server' | 'client';
  }) => {
    try {
      setLoading(true);
      const effMode = overrides?.mode || gridMode;
      const effSearch = overrides?.search !== undefined ? overrides.search : searchTerm;
      const effSortKey = overrides?.sortKey !== undefined ? overrides.sortKey : sortKey;
      const effSortDir = overrides?.sortDir !== undefined ? overrides.sortDir : sortDir;
      const effPage = overrides?.page !== undefined ? overrides.page : page;
      const effPageSize = overrides?.pageSize !== undefined ? overrides.pageSize : pageSize;

      const params: any = {};
      if (effMode === 'server') {
        if (effSearch) params.search = effSearch;
        if (effSortKey) params.sort_by = effSortKey;
        if (effSortDir) params.sort_dir = effSortDir;
        params.page = effPage;
        params.page_size = effPageSize;
      }

      const data = await getTenants(params);
      setTenants(data);
      setTotalCount((data as any).total ?? data.length);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [gridMode, searchTerm, sortKey, sortDir, page, pageSize]);

  useEffect(() => {
    loadTenants();
  }, [gridMode]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleDataTableParamsChange = (params: {
    page: number;
    pageSize: number;
    sortKey: string | null;
    sortDir: 'asc' | 'desc';
    search: string;
  }) => {
    setPage(params.page);
    setPageSize(params.pageSize);
    setSortKey(params.sortKey);
    setSortDir(params.sortDir);
    setSearchTerm(params.search);

    if (gridMode === 'server') {
      loadTenants({
        page: params.page,
        pageSize: params.pageSize,
        sortKey: params.sortKey,
        sortDir: params.sortDir,
        search: params.search,
      });
    }
  };

  const handleToggleStatus = async (tenant: Tenant) => {
    const nextStatus = tenant.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';
    if (nextStatus === 'SUSPENDED') {
      const ok = await confirm({
        title: 'Suspend Clinic Tenant',
        message: `Are you sure you want to suspend clinic tenant "${tenant.name}"?`,
        description: '⚠️ Clinic admin and front desk staff will temporarily lose access to the portal until reactivated.',
        confirmText: 'Yes, Suspend Clinic',
        cancelText: 'Keep Active',
        variant: 'warning',
      });
      if (!ok) return;
    }
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
            <span>{tenant.owner_name || 'Not provided'}</span>
          </div>
          <div className="text-slate-400 text-[11px] mt-0.5">
            {tenant.owner_phone || '—'}
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
        <div className="flex items-center justify-end gap-1.5">
          <button
            onClick={() => navigate(`/tenants/${tenant.id}/edit`)}
            className="px-2.5 py-1 text-xs font-bold bg-purple-50 text-purple-700 hover:bg-purple-100 rounded-lg transition inline-flex items-center gap-1 border border-purple-200"
            title="Edit Clinic Profile"
          >
            <Edit3 className="w-3.5 h-3.5" />
            <span>Edit</span>
          </button>

          <button
            onClick={() => handleToggleStatus(tenant)}
            className={`px-2.5 py-1 rounded-lg text-xs font-bold border transition ${
              tenant.status === 'ACTIVE'
                ? 'border-rose-200 text-rose-700 hover:bg-rose-50'
                : 'border-emerald-200 text-emerald-700 hover:bg-emerald-50'
            }`}
          >
            {tenant.status === 'ACTIVE' ? 'Suspend' : 'Activate'}
          </button>
        </div>
      )
    }
  ], [navigate, confirm]);

  return (
    <div className="space-y-6">
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
        mode={gridMode}
        totalCount={totalCount}
        page={page}
        pageSize={pageSize}
        sortKey={sortKey}
        sortDir={sortDir}
        searchTerm={searchTerm}
        onParamsChange={handleDataTableParamsChange}
        actionButton={
          <button
            onClick={() => navigate('/tenants/new')}
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
    </div>
  );
};
