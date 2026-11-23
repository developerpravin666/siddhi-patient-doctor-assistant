import React, { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import { MessageSquare, MapPin } from 'lucide-react';
import { Clinic, AppContextType } from '../types';
import { getClinics } from '../api/client';

interface SettingsProps {
  clinic?: Clinic;
}

export const SettingsPage: React.FC<SettingsProps> = (props) => {
  const outlet = useOutletContext<AppContextType>();
  const [clinicData, setClinicData] = useState<Clinic | null>(props.clinic || null);

  useEffect(() => {
    if (!props.clinic) {
      getClinics()
        .then((data) => {
          if (data && data.length > 0) {
            setClinicData(data[0]);
          }
        })
        .catch((err) => {
          console.error('Failed to load clinic settings:', err);
        });
    }
  }, [props.clinic]);

  const clinic = props.clinic || clinicData || outlet?.clinics?.[0];
  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h2 className="text-xl font-bold text-slate-900">Clinic Profile & WhatsApp Integration Settings</h2>
        <p className="text-xs text-slate-500">Configure clinic metadata, Meta Cloud API credentials, and reminder automation</p>
      </div>

      {/* Clinic Details */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-sm space-y-4">
        <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
          <MapPin className="w-4 h-4 text-brand-600" /> Clinic Profile Information
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          <div>
            <label className="block text-slate-500 font-semibold mb-1">Clinic Name</label>
            <input
              type="text"
              readOnly
              value={clinic?.name || "Dr. Siddhi Patidar's Clinic"}
              className="w-full px-3.5 py-2 rounded-xl bg-slate-50 border border-slate-200 text-slate-800 font-medium"
            />
          </div>

          <div>
            <label className="block text-slate-500 font-semibold mb-1">Clinic Phone</label>
            <input
              type="text"
              readOnly
              value={clinic?.phone || "+91 98765 00000"}
              className="w-full px-3.5 py-2 rounded-xl bg-slate-50 border border-slate-200 text-slate-800 font-medium"
            />
          </div>

          <div className="md:col-span-2">
            <label className="block text-slate-500 font-semibold mb-1">Clinic Physical Address</label>
            <input
              type="text"
              readOnly
              value={clinic?.address || "Suite 402, Siddhi Medical Enclave, Central Avenue"}
              className="w-full px-3.5 py-2 rounded-xl bg-slate-50 border border-slate-200 text-slate-800 font-medium"
            />
          </div>

          <div>
            <label className="block text-slate-500 font-semibold mb-1">Timezone</label>
            <input
              type="text"
              readOnly
              value={clinic?.timezone || "Asia/Kolkata"}
              className="w-full px-3.5 py-2 rounded-xl bg-slate-50 border border-slate-200 text-slate-800 font-medium"
            />
          </div>

          <div>
            <label className="block text-slate-500 font-semibold mb-1">Consultation Timings</label>
            <input
              type="text"
              readOnly
              value={clinic?.consultation_hours || "Monday - Saturday: 9:00 AM - 1:00 PM, 4:00 PM - 7:30 PM"}
              className="w-full px-3.5 py-2 rounded-xl bg-slate-50 border border-slate-200 text-slate-800 font-medium"
            />
          </div>
        </div>
      </div>

      {/* WhatsApp Cloud API & Template Settings */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-sm space-y-4">
        <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-emerald-600" /> WhatsApp Cloud API & Template Configuration
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          <div>
            <label className="block text-slate-500 font-semibold mb-1">Webhook Verification Token</label>
            <input
              type="text"
              readOnly
              value="siddhi_patient_assistant_verify_token_secure_2026"
              className="w-full px-3.5 py-2 rounded-xl bg-slate-50 border border-slate-200 text-slate-800 font-mono"
            />
          </div>

          <div>
            <label className="block text-slate-500 font-semibold mb-1">Webhook URL</label>
            <input
              type="text"
              readOnly
              value="https://yourdomain.com/webhook"
              className="w-full px-3.5 py-2 rounded-xl bg-slate-50 border border-slate-200 text-slate-800 font-mono"
            />
          </div>
        </div>

        {/* Reminder Template Info from BUSINESS_FLOW.md Section 6 */}
        <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 space-y-2 text-xs">
          <div className="flex items-center justify-between">
            <span className="font-bold text-slate-800">Approved Meta Template: appointment_reminder_1hr</span>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
              CATEGORY: UTILITY
            </span>
          </div>
          <p className="text-slate-600 font-mono text-[11px] whitespace-pre-wrap bg-white p-3 rounded-lg border border-slate-200">
            {`Hello {{1}},

This is a friendly reminder that your appointment with {{2}} is scheduled in 1 hour at {{3}}.

📍 Clinic Location: {{4}}

Please arrive 10 minutes early. If you need directions or need to reschedule, reply to this message.`}
          </p>
          <p className="text-slate-500 text-[11px]">
            Parameters: <code className="text-brand-600 font-bold">&#123;&#123;1&#125;&#125;</code>: Patient Name, <code className="text-brand-600 font-bold">&#123;&#123;2&#125;&#125;</code>: Doctor Name, <code className="text-brand-600 font-bold">&#123;&#123;3&#125;&#125;</code>: Time Slot, <code className="text-brand-600 font-bold">&#123;&#123;4&#125;&#125;</code>: Address
          </p>
        </div>
      </div>
    </div>
  );
};
