import React from 'react';
import { Clock, Calendar, Stethoscope } from 'lucide-react';
import { Doctor } from '../types';

interface DoctorsProps {
  doctors: Doctor[];
}

export const Doctors: React.FC<DoctorsProps> = ({ doctors }) => {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Doctors & Consultation Schedules</h2>
          <p className="text-xs text-slate-500">Configure clinic physicians, active days, and 30-minute time slots</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {doctors.map((doc) => (
          <div key={doc.id} className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-sm space-y-4">
            <div className="flex items-start justify-between">
              <div className="flex items-center space-x-3">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-brand-600 to-emerald-400 flex items-center justify-center text-white shadow-md">
                  <Stethoscope className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-base">{doc.name}</h3>
                  <p className="text-xs text-brand-600 font-semibold">{doc.specialty}</p>
                </div>
              </div>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                Active
              </span>
            </div>

            <div className="space-y-2.5 text-xs text-slate-600 border-t border-slate-100 pt-3">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-500 flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-slate-400" /> Working Days
                </span>
                <span className="font-bold text-slate-800">{doc.available_days}</span>
              </div>

              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-500 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-slate-400" /> Slot Duration
                </span>
                <span className="font-bold text-slate-800">{doc.slot_duration_minutes} Mins</span>
              </div>
            </div>

            <div className="space-y-2 border-t border-slate-100 pt-3">
              <p className="text-xs font-bold text-slate-700">Morning Consultation Slots</p>
              <div className="flex flex-wrap gap-1">
                {doc.morning_slots.split(',').map((slot) => (
                  <span key={slot} className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded-md text-[11px] font-medium">
                    {slot.trim()}
                  </span>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-bold text-slate-700">Evening Consultation Slots</p>
              <div className="flex flex-wrap gap-1">
                {doc.evening_slots.split(',').map((slot) => (
                  <span key={slot} className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded-md text-[11px] font-medium">
                    {slot.trim()}
                  </span>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
