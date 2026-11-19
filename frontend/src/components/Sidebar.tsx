import React from 'react';
import { 
  LayoutDashboard, 
  CalendarDays, 
  MessageSquare, 
  UserCheck, 
  Users, 
  Settings, 
  ShieldAlert,
  Clock
} from 'lucide-react';

export type NavTab = 'dashboard' | 'appointments' | 'simulator' | 'doctors' | 'patients' | 'settings';

interface SidebarProps {
  currentTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
  pendingRemindersCount: number;
}

export const Sidebar: React.FC<SidebarProps> = ({ currentTab, onSelectTab, pendingRemindersCount }) => {
  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'appointments', label: 'Appointments', icon: CalendarDays },
    { id: 'simulator', label: 'WhatsApp Simulator', icon: MessageSquare, badge: 'Live AI' },
    { id: 'doctors', label: 'Doctors & Schedules', icon: UserCheck },
    { id: 'patients', label: 'Patients Directory', icon: Users },
    { id: 'settings', label: 'Clinic & Reminders', icon: Settings },
  ];

  return (
    <aside className="w-64 bg-slate-900 text-slate-300 flex flex-col shrink-0 min-h-[calc(100vh-65px)] border-r border-slate-800">
      <div className="p-4 flex-1 space-y-1">
        <p className="px-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-2">
          Management
        </p>
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onSelectTab(item.id as NavTab)}
              className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all ${
                isActive
                  ? 'bg-brand-600 text-white shadow-md shadow-brand-700/30'
                  : 'hover:bg-slate-800 hover:text-white text-slate-400'
              }`}
            >
              <div className="flex items-center space-x-3">
                <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                <span>{item.label}</span>
              </div>
              {item.badge && (
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                  isActive ? 'bg-white/20 text-white' : 'bg-brand-900/80 text-brand-400 border border-brand-700/50'
                }`}>
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}

        <div className="pt-6">
          <p className="px-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-2">
            Automations & Guardrails
          </p>
          
          <div className="bg-slate-800/60 rounded-xl p-3 border border-slate-800 space-y-2.5">
            <div className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-1.5 text-slate-400 font-medium">
                <Clock className="w-3.5 h-3.5 text-brand-400" /> 1-Hr Reminders
              </span>
              <span className="bg-brand-500/10 text-brand-400 px-2 py-0.5 rounded-full text-[10px] font-semibold border border-brand-500/20">
                {pendingRemindersCount} Queued
              </span>
            </div>
            
            <div className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-1.5 text-slate-400 font-medium">
                <ShieldAlert className="w-3.5 h-3.5 text-amber-400" /> Safety Filter
              </span>
              <span className="text-emerald-400 font-semibold text-[11px]">Strict Active</span>
            </div>
          </div>
        </div>
      </div>

      <div className="p-4 border-t border-slate-800/80">
        <div className="bg-gradient-to-r from-emerald-950/40 to-slate-900 p-3 rounded-xl border border-emerald-900/30">
          <p className="text-xs font-semibold text-emerald-400">Dr. Siddhi Patel Assistant</p>
          <p className="text-[11px] text-slate-400 mt-0.5">FastAPI & Gemini 2.5 Flash</p>
          <p className="text-[10px] text-slate-500 mt-1">Multi-Tenant v1.0 Production</p>
        </div>
      </div>
    </aside>
  );
};
