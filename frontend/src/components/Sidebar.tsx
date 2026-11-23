import React from 'react';
import { NavLink } from 'react-router-dom';
import { 
  LayoutDashboard, 
  CalendarDays, 
  MessageSquare, 
  UserCheck, 
  Users, 
  Settings, 
  Clock,
  Building2,
  UserCog,
  Stethoscope,
  Radio
} from 'lucide-react';
import { UserRole, AdminUser } from '../types';

export type NavTab = 
  | 'dashboard' 
  | 'tenants' 
  | 'users' 
  | 'appointments' 
  | 'simulator' 
  | 'doctors' 
  | 'patients' 
  | 'whatsapp-config'
  | 'webhook-events'
  | 'settings';

interface SidebarProps {
  currentTab?: NavTab;
  onSelectTab?: (tab: NavTab) => void;
  pendingRemindersCount?: number;
  currentUser?: AdminUser | null;
  userRole?: UserRole;
}

export const Sidebar: React.FC<SidebarProps> = ({ 
  pendingRemindersCount = 0,
  currentUser,
  userRole = 'RECEPTIONIST'
}) => {
  // Navigation items with routes, role restrictions, and dynamic screen permissions
  const allNavItems = [
    { 
      id: 'dashboard', 
      path: '/dashboard',
      label: 'Dashboard', 
      icon: LayoutDashboard,
      roles: ['SUPER_ADMIN', 'CLINIC_ADMIN'],
      isVisible: userRole !== 'RECEPTIONIST' || !!currentUser?.permissions?.analytics?.view
    },
    { 
      id: 'tenants', 
      path: '/tenants',
      label: 'Clinic Tenants', 
      icon: Building2, 
      badge: 'Product Owner',
      roles: ['SUPER_ADMIN'],
      isVisible: userRole === 'SUPER_ADMIN'
    },
    { 
      id: 'users', 
      path: '/users',
      label: userRole === 'SUPER_ADMIN' ? 'User Accounts' : 'Staff Accounts', 
      icon: UserCog, 
      roles: ['SUPER_ADMIN', 'CLINIC_ADMIN'],
      isVisible: userRole === 'SUPER_ADMIN' || userRole === 'CLINIC_ADMIN' || !!currentUser?.permissions?.users?.view
    },
    { 
      id: 'appointments', 
      path: '/appointments',
      label: userRole === 'RECEPTIONIST' ? 'Live Appointments Queue' : 'Appointments', 
      icon: CalendarDays,
      roles: ['SUPER_ADMIN', 'CLINIC_ADMIN', 'RECEPTIONIST'],
      isVisible: userRole !== 'RECEPTIONIST' || currentUser?.permissions?.appointments?.view !== false
    },
    { 
      id: 'simulator', 
      path: '/simulator',
      label: 'WhatsApp Simulator', 
      icon: MessageSquare, 
      badge: 'AI Chat',
      roles: ['SUPER_ADMIN', 'CLINIC_ADMIN', 'RECEPTIONIST'],
      isVisible: userRole !== 'RECEPTIONIST' || currentUser?.permissions?.simulator?.view !== false
    },
    { 
      id: 'doctors', 
      path: '/doctors',
      label: 'Doctors & Schedules', 
      icon: UserCheck,
      roles: ['SUPER_ADMIN', 'CLINIC_ADMIN', 'RECEPTIONIST'],
      isVisible: userRole !== 'RECEPTIONIST' || currentUser?.permissions?.doctors?.view !== false
    },
    { 
      id: 'specializations', 
      path: '/specializations',
      label: 'Specializations Master', 
      icon: Stethoscope,
      roles: ['SUPER_ADMIN', 'CLINIC_ADMIN'],
      isVisible: userRole === 'SUPER_ADMIN' || userRole === 'CLINIC_ADMIN'
    },
    { 
      id: 'patients', 
      path: '/patients',
      label: 'Patients Directory', 
      icon: Users,
      roles: ['SUPER_ADMIN', 'CLINIC_ADMIN', 'RECEPTIONIST'],
      isVisible: userRole !== 'RECEPTIONIST' || currentUser?.permissions?.patients?.view !== false
    },
    { 
      id: 'whatsapp-config', 
      path: '/whatsapp-config',
      label: 'WhatsApp API & Bot', 
      icon: MessageSquare,
      roles: ['SUPER_ADMIN', 'CLINIC_ADMIN'],
      isVisible: userRole === 'SUPER_ADMIN' || userRole === 'CLINIC_ADMIN'
    },
    { 
      id: 'webhook-events', 
      path: '/webhook-events',
      label: 'Webhook Stream', 
      icon: Radio,
      badge: 'Super Admin',
      roles: ['SUPER_ADMIN'],
      isVisible: userRole === 'SUPER_ADMIN'
    },
    { 
      id: 'settings', 
      path: '/settings',
      label: 'Clinic & Reminders', 
      icon: Settings,
      roles: ['SUPER_ADMIN', 'CLINIC_ADMIN'],
      isVisible: userRole === 'SUPER_ADMIN' || userRole === 'CLINIC_ADMIN'
    },
  ];

  // Filter items matching permissions
  const visibleNavItems = allNavItems.filter((item) => item.isVisible);

  return (
    <aside className="w-64 bg-slate-900 text-slate-300 flex flex-col shrink-0 min-h-[calc(100vh-65px)] border-r border-slate-800">
      <div className="p-4 flex-1 space-y-1">
        <div className="px-3 py-1 flex items-center justify-between mb-2">
          <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
            {userRole === 'SUPER_ADMIN' && 'Product Owner Portal'}
            {userRole === 'CLINIC_ADMIN' && 'Doctor Clinic Portal'}
            {userRole === 'RECEPTIONIST' && 'Front Desk Portal'}
          </p>
        </div>

        {visibleNavItems.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.id}
              to={item.path}
              className={({ isActive }) =>
                `w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all ${
                  isActive
                    ? 'bg-brand-600 text-white shadow-md shadow-brand-700/30'
                    : 'hover:bg-slate-800 hover:text-white text-slate-400'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <div className="flex items-center space-x-3">
                    <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                    <span>{item.label}</span>
                  </div>
                  {item.badge && (
                    <span
                      className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${
                        isActive
                          ? 'bg-brand-500 text-white'
                          : 'bg-slate-800 text-slate-400 border border-slate-700'
                      }`}
                    >
                      {item.badge}
                    </span>
                  )}
                </>
              )}
            </NavLink>
          );
        })}
      </div>

      {/* WhatsApp Scheduler Status Indicator in Sidebar */}
      <div className="p-4 border-t border-slate-800/80 bg-slate-950/40">
        <div className="rounded-xl p-3 bg-slate-800/50 border border-slate-800 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="flex items-center gap-1.5 text-slate-400 font-medium">
              <Clock className="w-3.5 h-3.5 text-amber-400" />
              <span>Reminders Job</span>
            </span>
            <span className="flex items-center gap-1 text-[11px] font-bold text-emerald-400">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
              Active
            </span>
          </div>
          <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1 border-t border-slate-700/40">
            <span>Pending 1h Alerts:</span>
            <span className="font-bold text-white px-1.5 py-0.2 bg-slate-700 rounded-md">
              {pendingRemindersCount}
            </span>
          </div>
        </div>
      </div>
    </aside>
  );
};
