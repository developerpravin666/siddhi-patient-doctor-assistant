import React, { useState, useEffect, useCallback } from 'react';
import { 
  Plus, 
  Shield, 
  UserCheck, 
  ClipboardList, 
  CheckCircle, 
  XCircle, 
  Edit3, 
  Trash2, 
  Lock
} from 'lucide-react';
import { useOutletContext, useNavigate } from 'react-router-dom';
import { getUsers, updateUser, deleteUser } from '../api/client';
import { AdminUser, UserRole, AppContextType } from '../types';
import { DataTable, ColumnDef } from '../components/DataTable';
import { useConfirm } from '../context/ConfirmationContext';

interface UsersManagementProps {
  currentUser?: AdminUser | null;
  currentUserRole?: UserRole;
  defaultMode?: 'server' | 'client';
}

const SCREEN_METADATA = [
  { key: 'appointments', label: 'Appointments' },
  { key: 'patients', label: 'Patients' },
  { key: 'doctors', label: 'Doctors' },
  { key: 'simulator', label: 'Simulator' },
  { key: 'analytics', label: 'Analytics' },
];

export const UsersManagement: React.FC<UsersManagementProps> = (props) => {
  const navigate = useNavigate();
  const outlet = useOutletContext<AppContextType>();
  const currentUser = props.currentUser !== undefined ? props.currentUser : outlet?.currentUser;
  const currentUserRole = props.currentUserRole || outlet?.userRole || 'CLINIC_ADMIN';

  const [gridMode] = useState<'server' | 'client'>(props.defaultMode || 'server');

  const [page, setPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(10);
  const [sortKey, setSortKey] = useState<string | null>('full_name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [totalCount, setTotalCount] = useState<number>(0);

  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const confirm = useConfirm();

  const showToast = (text: string, type: 'success' | 'error') => {
    setToastMessage({ text, type });
    setTimeout(() => setToastMessage(null), 4000);
  };

  const loadUsers = useCallback(async (overrides?: {
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

      const data = await getUsers(params);
      setUsers(data);
      setTotalCount((data as any).total ?? data.length);
    } catch (err: any) {
      showToast(err.response?.data?.detail || 'Failed to load staff accounts', 'error');
    } finally {
      setLoading(false);
    }
  }, [gridMode, searchTerm, sortKey, sortDir, page, pageSize]);

  useEffect(() => {
    loadUsers();
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
      loadUsers({
        page: params.page,
        pageSize: params.pageSize,
        sortKey: params.sortKey,
        sortDir: params.sortDir,
        search: params.search,
      });
    }
  };

  const handleToggleActive = async (user: AdminUser) => {
    try {
      await updateUser(user.id, { is_active: !user.is_active });
      showToast(`Account @${user.username} is now ${!user.is_active ? 'Active' : 'Disabled'}.`, 'success');
      loadUsers();
    } catch (err: any) {
      showToast(err.response?.data?.detail || 'Failed to update account status', 'error');
    }
  };

  const handleDeleteUser = async (user: AdminUser) => {
    const ok = await confirm({
      title: 'Delete Staff Account',
      message: (
        <span>
          Are you sure you want to permanently delete <strong className="text-slate-900">{user.full_name}</strong> (<code className="text-rose-600 font-mono">@{user.username}</code>)?
        </span>
      ),
      description: '⚠️ All access and granular screen permissions for this staff member will be revoked immediately. This action cannot be undone.',
      confirmText: 'Yes, Delete Account',
      cancelText: 'Keep Account',
      variant: 'danger',
    });
    if (!ok) return;

    try {
      await deleteUser(user.id);
      showToast(`Staff account @${user.username} deleted successfully.`, 'success');
      loadUsers();
    } catch (err: any) {
      showToast(err.response?.data?.detail || 'Failed to delete staff account', 'error');
    }
  };

  const getRoleBadge = (role: string) => {
    switch (role) {
      case 'SUPER_ADMIN':
        return {
          label: 'Product Owner (Super Admin)',
          bg: 'bg-purple-100 text-purple-800 border-purple-200',
          icon: Shield,
        };
      case 'CLINIC_ADMIN':
        return {
          label: 'Doctor (Clinic Admin)',
          bg: 'bg-emerald-100 text-emerald-800 border-emerald-200',
          icon: UserCheck,
        };
      case 'RECEPTIONIST':
      default:
        return {
          label: 'Front Desk (Receptionist)',
          bg: 'bg-sky-100 text-sky-800 border-sky-200',
          icon: ClipboardList,
        };
    }
  };

  // Define Grid Columns
  const columns: ColumnDef<AdminUser>[] = [
    {
      key: 'full_name',
      header: 'Staff Member',
      sortable: true,
      searchValue: (u) => `${u.full_name} ${u.username}`,
      render: (user) => (
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center font-bold text-slate-700 text-xs shadow-inner">
            {user.full_name.charAt(0).toUpperCase()}
          </div>
          <div>
            <p className="font-bold text-slate-900 text-xs sm:text-sm">{user.full_name}</p>
            <p className="text-slate-400 font-mono text-[11px]">@{user.username}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'role',
      header: 'Role',
      sortable: true,
      render: (user) => {
        const badge = getRoleBadge(user.role);
        const RoleIcon = badge.icon;
        return (
          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold border ${badge.bg}`}>
            <RoleIcon className="w-3.5 h-3.5" />
            <span>{badge.label}</span>
          </span>
        );
      },
    },
    {
      key: 'permissions',
      header: 'Screen & Action Permissions',
      sortable: false,
      render: (user) => {
        if (user.role === 'SUPER_ADMIN') {
          return (
            <span className="text-purple-700 font-semibold text-[11px] bg-purple-50 px-2 py-0.5 rounded-md border border-purple-100">
              👑 Unrestricted Platform Access
            </span>
          );
        }
        if (user.role === 'CLINIC_ADMIN') {
          return (
            <span className="text-emerald-700 font-semibold text-[11px] bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-100">
              🩺 Full Clinic Tenant Admin
            </span>
          );
        }
        return (
          <div className="flex flex-wrap gap-1 max-w-md">
            {SCREEN_METADATA.map((s) => {
              const p = user.permissions?.[s.key];
              if (!p || !p.view) return null;
              const actions: string[] = [];
              if (p.create) actions.push('Add');
              if (p.edit) actions.push('Edit');
              if (p.delete) actions.push('Del');
              return (
                <span
                  key={s.key}
                  className="inline-flex items-center gap-1 bg-slate-100 text-slate-700 px-2 py-0.5 rounded text-[10px] border border-slate-200"
                >
                  <span className="font-bold">{s.label}:</span>
                  <span className="text-slate-500">
                    {actions.length > 0 ? actions.join('+') : 'View'}
                  </span>
                </span>
              );
            })}
          </div>
        );
      },
    },
    {
      key: 'is_active',
      header: 'Status',
      sortable: true,
      render: (user) => (
        <span
          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold ${
            user.is_active ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
          }`}
        >
          {user.is_active ? <CheckCircle className="w-3 h-3 text-emerald-600" /> : <XCircle className="w-3 h-3 text-rose-600" />}
          <span>{user.is_active ? 'Active' : 'Disabled'}</span>
        </span>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      sortable: false,
      align: 'right',
      render: (user) => {
        const isSelf = currentUser?.id === user.id;
        const isDefaultSuperAdmin = user.username === 'superadmin';
        const canDeleteUser = !isSelf && !isDefaultSuperAdmin;

        return (
          <div className="flex items-center justify-end gap-1.5">
            <button
              onClick={() => navigate(`/users/${user.id}/edit`)}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 transition"
              title="Edit Account & Permissions"
            >
              <Edit3 className="w-3 h-3" />
              <span>Edit</span>
            </button>

            <button
              onClick={() => handleToggleActive(user)}
              disabled={isSelf}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold border transition ${
                isSelf 
                  ? 'opacity-40 cursor-not-allowed border-slate-200 text-slate-400' 
                  : 'border-slate-200 hover:bg-slate-50 text-slate-600'
              }`}
              title={isSelf ? 'Cannot disable your own active account' : undefined}
            >
              {user.is_active ? 'Disable' : 'Enable'}
            </button>

            {canDeleteUser ? (
              <button
                onClick={() => handleDeleteUser(user)}
                className="p-1 rounded-lg text-rose-600 hover:bg-rose-50 border border-rose-200 hover:border-rose-300 transition"
                title={`Delete @${user.username}`}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            ) : (
              <span className="p-1 text-slate-300" title={isSelf ? 'Cannot delete yourself' : 'Primary Admin protected'}>
                <Lock className="w-3.5 h-3.5" />
              </span>
            )}
          </div>
        );
      },
    },
  ];

  return (
    <div className="space-y-6">
      {/* Toast Alert */}
      {toastMessage && (
        <div
          className={`p-3 rounded-xl border text-xs font-semibold flex items-center justify-between ${
            toastMessage.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
              : 'bg-rose-50 text-rose-800 border-rose-200'
          }`}
        >
          <span>{toastMessage.text}</span>
          <button onClick={() => setToastMessage(null)} className="text-slate-400 hover:text-slate-600 font-bold ml-2">
            ×
          </button>
        </div>
      )}

      {/* Main Grid with Searching, Sorting, and Paging */}
      <DataTable<AdminUser>
        title={currentUserRole === 'SUPER_ADMIN' ? 'System User Accounts & Roles' : 'Clinic Staff & Front Desk Accounts'}
        subtitle={
          currentUserRole === 'SUPER_ADMIN'
            ? 'Manage Super Admins, Doctors, and Tenant Staff with granular security controls'
            : 'Create Front Desk accounts and customize screen-by-screen access (View, Add, Edit, Delete)'
        }
        data={users}
        columns={columns}
        keyExtractor={(u) => u.id}
        loading={loading}
        searchPlaceholder="Search staff by name or username..."
        mode={gridMode}
        totalCount={totalCount}
        page={page}
        pageSize={pageSize}
        sortKey={sortKey}
        sortDir={sortDir}
        searchTerm={searchTerm}
        onParamsChange={handleDataTableParamsChange}
        emptyMessage="No staff accounts found."
        defaultPageSize={10}
        initialSortKey="full_name"
        actionButton={
          <button
            onClick={() => navigate('/users/new')}
            className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs transition shadow-sm flex items-center gap-1.5"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Staff Account</span>
          </button>
        }
      />
    </div>
  );
};
