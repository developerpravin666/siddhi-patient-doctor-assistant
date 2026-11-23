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
  | 'specializations'
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

interface NavItemConfig {
  id: string;
  path: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string;
  badgeColor?: string;
  isVisible: boolean;
}

interface NavSectionConfig {
  title: string;
  items: NavItemConfig[];
}

export const Sidebar: React.FC<SidebarProps> = ({ 
  pendingRemindersCount = 0,
  currentUser,
  userRole = 'RECEPTIONIST'
}) => {
  // Navigation Sections dynamically built based on Role & Permissions
  const getSections = (): NavSectionConfig[] => {
    // 1. SUPER ADMIN: Regrouped into Platform Administration & Clinic Management
    if (userRole === 'SUPER_ADMIN') {
      return [
        {
          title: 'Platform Administration',
          items: [
            {
              id: 'tenants',
              path: '/tenants',
              label: 'Clinic Tenants',
              icon: Building2,
              badge: 'Multi-Tenant',
              badgeColor: 'bg-purple-900/60 text-purple-300 border-purple-700/60',
              isVisible: true,
            },
            {
              id: 'users',
              path: '/users',
              label: 'User Accounts',
              icon: UserCog,
              isVisible: true,
            },
            {
              id: 'specializations',
              path: '/specializations',
              label: 'Specializations Master',
              icon: Stethoscope,
              isVisible: true,
            },
            {
              id: 'webhook-events',
              path: '/webhook-events',
              label: 'Webhook Stream',
              icon: Radio,
              badge: 'Live',
              badgeColor: 'bg-emerald-900/60 text-emerald-300 border-emerald-700/60',
              isVisible: true,
            },
          ],
        },
        {
          title: 'Clinic Management (Active Context)',
          items: [
            {
              id: 'dashboard',
              path: '/dashboard',
              label: 'Dashboard & KPIs',
              icon: LayoutDashboard,
              isVisible: true,
            },
            {
              id: 'appointments',
              path: '/appointments',
              label: 'Appointments Queue',
              icon: CalendarDays,
              isVisible: true,
            },
            {
              id: 'doctors',
              path: '/doctors',
              label: 'Doctors & Schedules',
              icon: UserCheck,
              isVisible: true,
            },
            {
              id: 'patients',
              path: '/patients',
              label: 'Patients Directory',
              icon: Users,
              isVisible: true,
            },
            {
              id: 'whatsapp-config',
              path: '/whatsapp-config',
              label: 'WhatsApp API & Bot',
              icon: MessageSquare,
              isVisible: true,
            },
            {
              id: 'settings',
              path: '/settings',
              label: 'Clinic & Reminders',
              icon: Settings,
              isVisible: true,
            },
            {
              id: 'simulator',
              path: '/simulator',
              label: 'WhatsApp Simulator',
              icon: MessageSquare,
              badge: 'AI Chat',
              badgeColor: 'bg-blue-900/60 text-blue-300 border-blue-700/60',
              isVisible: true,
            },
          ],
        },
      ];
    }

    // 2. CLINIC ADMIN (Doctor): Regrouped into Clinic Operations & Practice Settings
    if (userRole === 'CLINIC_ADMIN') {
      return [
        {
          title: 'Clinic Operations',
          items: [
            {
              id: 'dashboard',
              path: '/dashboard',
              label: 'Dashboard',
              icon: LayoutDashboard,
              isVisible: true,
            },
            {
              id: 'appointments',
              path: '/appointments',
              label: 'Live Appointments Queue',
              icon: CalendarDays,
              isVisible: true,
            },
            {
              id: 'doctors',
              path: '/doctors',
              label: 'Doctors & Schedules',
              icon: UserCheck,
              isVisible: true,
            },
            {
              id: 'patients',
              path: '/patients',
              label: 'Patients Directory',
              icon: Users,
              isVisible: true,
            },
            {
              id: 'specializations',
              path: '/specializations',
              label: 'Specializations',
              icon: Stethoscope,
              isVisible: true,
            },
            {
              id: 'simulator',
              path: '/simulator',
              label: 'WhatsApp Simulator',
              icon: MessageSquare,
              badge: 'AI Chat',
              badgeColor: 'bg-blue-900/60 text-blue-300 border-blue-700/60',
              isVisible: true,
            },
          ],
        },
        {
          title: 'Practice Settings & Team',
          items: [
            {
              id: 'users',
              path: '/users',
              label: 'Staff Accounts',
              icon: UserCog,
              isVisible: true,
            },
            {
              id: 'settings',
              path: '/settings',
              label: 'Clinic & Reminders',
              icon: Settings,
              isVisible: true,
            },
          ],
        },
      ];
    }

    // 3. RECEPTIONIST (Front Desk): Strictly permitted front desk operations
    return [
      {
        title: 'Front Desk Operations',
        items: [
          {
            id: 'appointments',
            path: '/appointments',
            label: 'Appointments Queue',
            icon: CalendarDays,
            isVisible: currentUser?.permissions?.appointments?.view !== false,
          },
          {
            id: 'patients',
            path: '/patients',
            label: 'Patients Directory',
            icon: Users,
            isVisible: currentUser?.permissions?.patients?.view !== false,
          },
          {
            id: 'doctors',
            path: '/doctors',
            label: 'Doctors & Schedules',
            icon: UserCheck,
            isVisible: currentUser?.permissions?.doctors?.view !== false,
          },
          {
            id: 'simulator',
            path: '/simulator',
            label: 'WhatsApp Simulator',
            icon: MessageSquare,
            badge: 'AI Chat',
            badgeColor: 'bg-blue-900/60 text-blue-300 border-blue-700/60',
            isVisible: currentUser?.permissions?.simulator?.view !== false,
          },
        ],
      },
    ];
  };

  const sections = getSections();

  return (
    <aside className="w-64 bg-slate-900 text-slate-300 flex flex-col shrink-0 min-h-[calc(100vh-65px)] border-r border-slate-800">
      <div className="p-4 flex-1 space-y-6 overflow-y-auto">
        {/* Role Portal Label */}
        <div className="px-3 py-1 flex items-center justify-between">
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
            {userRole === 'SUPER_ADMIN' && 'Super Admin Portal'}
            {userRole === 'CLINIC_ADMIN' && 'Clinic Doctor Portal'}
            {userRole === 'RECEPTIONIST' && 'Front Desk Portal'}
          </p>
        </div>

        {/* Grouped Sections */}
        {sections.map((section, sIdx) => {
          const visibleItems = section.items.filter((item) => item.isVisible);
          if (visibleItems.length === 0) return null;

          return (
            <div key={sIdx} className="space-y-1">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 px-3.5 pb-1">
                {section.title}
              </p>

              {visibleItems.map((item) => {
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
                          <span className="truncate">{item.label}</span>
                        </div>
                        {item.badge && (
                          <span
                            className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md border ${
                              isActive
                                ? 'bg-brand-500 text-white border-brand-400'
                                : item.badgeColor || 'bg-slate-800 text-slate-400 border-slate-700'
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
