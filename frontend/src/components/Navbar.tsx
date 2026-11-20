import React from 'react';
import { Stethoscope, Sparkles, LogOut, Shield, UserCheck, ClipboardList } from 'lucide-react';
import { AdminUser } from '../types';

interface NavbarProps {
  clinicName?: string;
  currentUser?: AdminUser | null;
  onLogout: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({ 
  clinicName = "Dr. Siddhi Patel's Clinic",
  currentUser,
  onLogout
}) => {
  const getRoleBadge = (role?: string) => {
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

  const badge = getRoleBadge(currentUser?.role);
  const RoleIcon = badge.icon;

  return (
    <header className="bg-white border-b border-slate-200 sticky top-0 z-30 px-6 py-3 flex items-center justify-between shadow-xs">
      <div className="flex items-center space-x-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-brand-600 to-emerald-400 flex items-center justify-center text-white shadow-md shadow-brand-500/20">
          <Stethoscope className="w-5 h-5" />
        </div>
        <div>
          <div className="flex items-center space-x-2">
            <h1 className="font-bold text-slate-900 tracking-tight text-lg">{clinicName}</h1>
            <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 text-emerald-800">
              <Sparkles className="w-3 h-3 text-emerald-600" /> WhatsApp AI Online
            </span>
          </div>
          <p className="text-xs text-slate-500 font-medium">Multi-Tenant Doctor-Patient Assistant</p>
        </div>
      </div>

      <div className="flex items-center space-x-4">
        {/* Role Badge */}
        {currentUser && (
          <div className={`hidden md:flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border ${badge.bg}`}>
            <RoleIcon className="w-3.5 h-3.5" />
            <span>{badge.label}</span>
          </div>
        )}

        {/* User Profile info */}
        {currentUser && (
          <div className="flex items-center space-x-3 pl-2 border-l border-slate-200">
            <div className="w-8 h-8 rounded-full bg-brand-100 text-brand-800 font-bold flex items-center justify-center text-xs">
              {currentUser.full_name.charAt(0)}
            </div>
            <div className="text-left hidden sm:block">
              <p className="text-xs font-bold text-slate-800 leading-tight">{currentUser.full_name}</p>
              <p className="text-[10px] text-slate-400">@{currentUser.username}</p>
            </div>
          </div>
        )}

        {/* Logout / Switch Role */}
        <button
          onClick={onLogout}
          title="Sign Out / Switch Role"
          className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition flex items-center gap-1.5 text-xs font-semibold"
        >
          <LogOut className="w-4 h-4" />
          <span className="hidden lg:inline">Switch Role</span>
        </button>
      </div>
    </header>
  );
};
