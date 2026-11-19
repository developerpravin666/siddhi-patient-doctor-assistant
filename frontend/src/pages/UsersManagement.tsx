import React, { useState, useEffect } from 'react';
import { 
  Plus, 
  Shield, 
  UserCheck, 
  ClipboardList, 
  CheckCircle, 
  XCircle, 
  Edit3 
} from 'lucide-react';
import { useOutletContext, useNavigate } from 'react-router-dom';
import { getUsers, updateUser } from '../api/client';
import { AdminUser, UserRole, AppContextType } from '../types';

interface UsersManagementProps {
  currentUser?: AdminUser | null;
  currentUserRole?: UserRole;
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
  const currentUserRole = props.currentUserRole || outlet?.userRole || 'CLINIC_ADMIN';

  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);

  const loadUsers = async () => {
    try {
      setLoading(true);
      const data = await getUsers();
      setUsers(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const handleToggleActive = async (user: AdminUser) => {
    try {
      await updateUser(user.id, { is_active: !user.is_active });
      loadUsers();
    } catch (err) {
      console.error(err);
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

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900">
            {currentUserRole === 'SUPER_ADMIN' ? 'System User Accounts & Roles' : 'Clinic Staff & Front Desk Accounts'}
          </h2>
          <p className="text-xs text-slate-500">
            {currentUserRole === 'SUPER_ADMIN'
              ? 'Manage Super Admins, Doctors, and Tenant Staff with granular security controls'
              : 'Create Front Desk accounts and customize screen-by-screen access (View, Add, Edit, Delete)'}
          </p>
        </div>

        <button
          onClick={() => navigate('/users/new')}
          className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm transition shadow-sm flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          <span>Add Staff Account</span>
        </button>
      </div>

      {/* Users Table */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-slate-400 text-sm">Loading staff accounts...</div>
        ) : users.length === 0 ? (
          <div className="p-8 text-center text-slate-400 text-sm">No accounts found.</div>
        ) : (
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/75 text-slate-500 uppercase font-semibold tracking-wider">
                <th className="py-3 px-4">User</th>
                <th className="py-3 px-4">Role</th>
                <th className="py-3 px-4">Screen & Action Permissions</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {users.map((user) => {
                const badge = getRoleBadge(user.role);
                const RoleIcon = badge.icon;

                return (
                  <tr key={user.id} className="hover:bg-slate-50/50 transition">
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center font-bold text-slate-700 text-xs">
                          {user.full_name.charAt(0)}
                        </div>
                        <div>
                          <p className="font-bold text-slate-900 text-sm">{user.full_name}</p>
                          <p className="text-slate-400 font-mono text-[11px]">@{user.username}</p>
                        </div>
                      </div>
                    </td>

                    <td className="py-3.5 px-4">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold border ${badge.bg}`}>
                        <RoleIcon className="w-3.5 h-3.5" />
                        <span>{badge.label}</span>
                      </span>
                    </td>

                    <td className="py-3.5 px-4">
                      {user.role === 'SUPER_ADMIN' ? (
                        <span className="text-purple-700 font-semibold text-[11px] bg-purple-50 px-2 py-0.5 rounded-md border border-purple-100">
                          👑 Unrestricted Platform Access
                        </span>
                      ) : user.role === 'CLINIC_ADMIN' ? (
                        <span className="text-emerald-700 font-semibold text-[11px] bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-100">
                          🩺 Full Clinic Tenant Admin
                        </span>
                      ) : (
                        <div className="flex flex-wrap gap-1 max-w-md">
                          {SCREEN_METADATA.map((s) => {
                            const p = user.permissions?.[s.key];
                            if (!p || !p.view) return null;
                            const actions = [];
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
                      )}
                    </td>

                    <td className="py-3.5 px-4">
                      <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                        user.is_active ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                      }`}>
                        {user.is_active ? <CheckCircle className="w-3 h-3 text-emerald-600" /> : <XCircle className="w-3 h-3 text-rose-600" />}
                        <span>{user.is_active ? 'Active' : 'Disabled'}</span>
                      </span>
                    </td>

                    <td className="py-3.5 px-4 text-right space-x-2">
                      <button
                        onClick={() => navigate(`/users/${user.id}/edit`)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 transition"
                      >
                        <Edit3 className="w-3 h-3" />
                        Edit
                      </button>
                      <button
                        onClick={() => handleToggleActive(user)}
                        className="px-2.5 py-1 rounded-lg text-xs font-bold border border-slate-200 hover:bg-slate-50 text-slate-600 transition"
                      >
                        {user.is_active ? 'Disable' : 'Enable'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};
