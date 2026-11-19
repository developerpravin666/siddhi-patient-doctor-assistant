import React from 'react';
import { Stethoscope, Bell, Sparkles } from 'lucide-react';

interface NavbarProps {
  clinicName?: string;
}

export const Navbar: React.FC<NavbarProps> = ({ clinicName = "Dr. Siddhi Patel's Clinic" }) => {
  return (
    <header className="bg-white border-b border-slate-200 sticky top-0 z-30 px-6 py-3.5 flex items-center justify-between shadow-sm">
      <div className="flex items-center space-x-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-brand-600 to-emerald-400 flex items-center justify-center text-white shadow-md shadow-brand-500/20">
          <Stethoscope className="w-5 h-5" />
        </div>
        <div>
          <div className="flex items-center space-x-2">
            <h1 className="font-bold text-slate-900 tracking-tight text-lg">{clinicName}</h1>
            <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 flex items-center gap-1">
              <Sparkles className="w-3 h-3 text-emerald-600" /> AI Receptionist Active
            </span>
          </div>
          <p className="text-xs text-slate-500 font-medium">WhatsApp Automated Booking & 1-Hr Reminders</p>
        </div>
      </div>

      <div className="flex items-center space-x-4">
        <div className="flex items-center space-x-2 bg-slate-100 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-700">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
          <span>Meta WhatsApp Cloud API: Online</span>
        </div>

        <button className="p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition relative">
          <Bell className="w-4 h-4" />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-rose-500 rounded-full"></span>
        </button>

        <div className="flex items-center space-x-3 pl-2 border-l border-slate-200">
          <div className="w-8 h-8 rounded-full bg-brand-100 text-brand-800 font-bold flex items-center justify-center text-xs">
            SP
          </div>
          <div className="text-left hidden md:block">
            <p className="text-xs font-bold text-slate-800">Dr. Siddhi Patel</p>
            <p className="text-[10px] text-slate-400">Chief Physician</p>
          </div>
        </div>
      </div>
    </header>
  );
};
