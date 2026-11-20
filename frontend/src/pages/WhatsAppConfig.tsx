import React, { useState, useEffect } from 'react';
import {
  MessageSquare,
  Key,
  Send,
  CheckCircle2,
  AlertCircle,
  Bot,
  UserCheck,
  Clock,
  Save,
} from 'lucide-react';
import { useOutletContext } from 'react-router-dom';
import { WhatsAppConfig, Doctor, AdminUser, UserRole, AppContextType } from '../types';
import { getWhatsAppConfig, updateWhatsAppConfig, testWhatsAppConnection, getDoctors } from '../api/client';
import { whatsappConfigSchema, validateForm } from '../utils/validation';
import { SearchableSelect } from '../components/SearchableSelect';

interface WhatsAppConfigProps {
  doctors?: Doctor[];
  currentUser?: AdminUser | null;
  userRole?: UserRole;
  onRefresh?: () => void;
}

export const WhatsAppConfigPage: React.FC<WhatsAppConfigProps> = (props) => {
  const outlet = useOutletContext<AppContextType>();
  const [doctorsList, setDoctorsList] = useState<Doctor[]>(props.doctors || []);
  const doctors = props.doctors || (doctorsList.length > 0 ? doctorsList : outlet?.doctors || []);
  const userRole = props.userRole || outlet?.userRole || 'CLINIC_ADMIN';

  const [config, setConfig] = useState<WhatsAppConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Form states
  const [phoneNumberId, setPhoneNumberId] = useState('');
  const [businessAccountId, setBusinessAccountId] = useState('');
  const [accessToken, setAccessToken] = useState('');
  const [verifyToken, setVerifyToken] = useState('siddhi_patient_assistant_verify_token_secure_2026');

  // Bot flow states
  const [enableDoctorSelection, setEnableDoctorSelection] = useState(true);
  const [defaultDoctorId, setDefaultDoctorId] = useState<string>('');
  const [welcomeMessage, setWelcomeMessage] = useState(
    'Hello! 👋 Welcome to our clinic. Please choose your doctor and preferred consultation slot.'
  );
  const [reminderMinutes, setReminderMinutes] = useState(60);
  const [enableAiBot, setEnableAiBot] = useState(true);

  // Testing states
  const [testNumber, setTestNumber] = useState('919823012345');
  const [testingConnection, setTestingConnection] = useState(false);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const canEdit = userRole === 'SUPER_ADMIN' || userRole === 'CLINIC_ADMIN';

  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    setToastMessage({ text, type });
    setTimeout(() => setToastMessage(null), 4000);
  };

  useEffect(() => {
    const fetchConfig = async () => {
      try {
        setLoading(true);
        const [data, doctorsData] = await Promise.all([
          getWhatsAppConfig(),
          props.doctors ? Promise.resolve(props.doctors) : getDoctors().catch(() => [])
        ]);
        setConfig(data);
        if (doctorsData) {
          setDoctorsList(doctorsData);
        }
        setPhoneNumberId(data.whatsapp_phone_number_id || '');
        setBusinessAccountId(data.whatsapp_business_account_id || '');
        setAccessToken(data.whatsapp_access_token || '');
        setVerifyToken(data.whatsapp_verify_token || 'siddhi_patient_assistant_verify_token_secure_2026');

        if (data.bot_config) {
          setEnableDoctorSelection(data.bot_config.enable_doctor_selection !== false);
          setDefaultDoctorId(data.bot_config.default_doctor_id || '');
          if (data.bot_config.welcome_message) setWelcomeMessage(data.bot_config.welcome_message);
          if (data.bot_config.reminder_lead_time_minutes) setReminderMinutes(data.bot_config.reminder_lead_time_minutes);
          setEnableAiBot(data.bot_config.enable_ai_bot !== false);
        }
      } catch (err: any) {
        showToast('Could not load WhatsApp settings. Using default configurations.', 'error');
      } finally {
        setLoading(false);
      }
    };
    fetchConfig();
  }, [props.doctors]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();

    const validation = validateForm(whatsappConfigSchema, {
      whatsapp_phone_number_id: phoneNumberId.trim(),
      whatsapp_business_account_id: businessAccountId.trim(),
      whatsapp_access_token: accessToken.trim(),
      whatsapp_verify_token: verifyToken.trim(),
    });

    if (!validation.isValid) {
      setFormErrors(validation.errors);
      return;
    }

    try {
      setSaving(true);
      setFormErrors({});

      const updated = await updateWhatsAppConfig({
        whatsapp_phone_number_id: phoneNumberId.trim(),
        whatsapp_business_account_id: businessAccountId.trim(),
        whatsapp_access_token: accessToken.trim(),
        whatsapp_verify_token: verifyToken.trim(),
        bot_config: {
          enable_doctor_selection: enableDoctorSelection,
          default_doctor_id: defaultDoctorId || null,
          welcome_message: welcomeMessage.trim(),
          reminder_lead_time_minutes: reminderMinutes,
          enable_ai_bot: enableAiBot,
        },
      });

      setConfig(updated);
      showToast('WhatsApp API credentials & patient booking workflow saved successfully!');
    } catch (err: any) {
      showToast(err.response?.data?.detail || 'Failed to update WhatsApp configuration', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleTestConnection = async () => {
    if (!testNumber.trim() || testNumber.trim().length < 10) {
      showToast('Please enter a valid 10-digit mobile number to test WhatsApp message delivery', 'error');
      return;
    }
    try {
      setTestingConnection(true);
      const res = await testWhatsAppConnection(testNumber.trim());
      if (res.status === 'SUCCESS') {
        showToast('Test WhatsApp message dispatched successfully!');
      } else {
        showToast(res.message || 'WhatsApp message dispatch failed. Verify access token.', 'error');
      }
    } catch (err: any) {
      showToast(err.response?.data?.detail || 'Failed to trigger test message', 'error');
    } finally {
      setTestingConnection(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-2xl p-12 text-center border border-slate-200">
        <div className="animate-spin w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full mx-auto mb-3" />
        <p className="text-xs text-slate-500 font-semibold">Loading WhatsApp API settings...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Toast Alert */}
      {toastMessage && (
        <div
          className={`p-3.5 rounded-xl border text-xs font-semibold flex items-center justify-between transition shadow-sm ${
            toastMessage.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}
        >
          <span>{toastMessage.type === 'success' ? '✓ ' : '✕ '} {toastMessage.text}</span>
          <button onClick={() => setToastMessage(null)} className="font-bold opacity-70 hover:opacity-100">
            ✕
          </button>
        </div>
      )}

      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-emerald-600" />
            WhatsApp Cloud API & Bot Configuration
          </h2>
          <p className="text-xs text-slate-500">
            Configure Meta Cloud API credentials, doctor selection options, and automated 1-hour reminders
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border shadow-sm ${
              config?.is_live
                ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                : 'bg-amber-50 text-amber-800 border-amber-200'
            }`}
          >
            {config?.is_live ? (
              <>
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span>WhatsApp Live: Active</span>
              </>
            ) : (
              <>
                <AlertCircle className="w-4 h-4 text-amber-600" />
                <span>Sandbox / Simulator Mode</span>
              </>
            )}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Configuration Form */}
        <div className="lg:col-span-2 space-y-6">
          <form onSubmit={handleSave} className="space-y-6">
            {/* Meta API Credentials Card */}
            <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
                    <Key className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-900 text-sm">Meta Cloud API Credentials</h3>
                    <p className="text-[11px] text-slate-500">Obtained from your Meta for Developers App Dashboard</p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                {/* Phone Number ID */}
                <div>
                  <label className="block font-bold text-slate-700 mb-1">WhatsApp Phone Number ID *</label>
                  <input
                    type="text"
                    value={phoneNumberId}
                    onChange={(e) => setPhoneNumberId(e.target.value)}
                    placeholder="e.g. 524189020786543"
                    disabled={!canEdit}
                    className={`w-full px-3 py-2 rounded-xl border font-mono text-xs focus:outline-none focus:ring-2 ${
                      formErrors.whatsapp_phone_number_id
                        ? 'border-rose-400 focus:ring-rose-500/20'
                        : 'border-slate-200 focus:ring-brand-500/20'
                    }`}
                  />
                  {formErrors.whatsapp_phone_number_id && (
                    <p className="text-[11px] text-rose-600 mt-1">{formErrors.whatsapp_phone_number_id}</p>
                  )}
                </div>

                {/* WABA ID */}
                <div>
                  <label className="block font-bold text-slate-700 mb-1">WhatsApp Business Account ID (WABA)</label>
                  <input
                    type="text"
                    value={businessAccountId}
                    onChange={(e) => setBusinessAccountId(e.target.value)}
                    placeholder="e.g. 104589201948203"
                    disabled={!canEdit}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                  />
                </div>
              </div>

              {/* Permanent Access Token */}
              <div className="text-xs">
                <label className="block font-bold text-slate-700 mb-1">Permanent System User Access Token *</label>
                <input
                  type="password"
                  value={accessToken}
                  onChange={(e) => setAccessToken(e.target.value)}
                  placeholder="EAAG... (Meta System User Token with whatsapp_business_messaging)"
                  disabled={!canEdit}
                  className={`w-full px-3 py-2 rounded-xl border font-mono text-xs focus:outline-none focus:ring-2 ${
                    formErrors.whatsapp_access_token
                      ? 'border-rose-400 focus:ring-rose-500/20'
                      : 'border-slate-200 focus:ring-brand-500/20'
                  }`}
                />
                {formErrors.whatsapp_access_token && (
                  <p className="text-[11px] text-rose-600 mt-1">{formErrors.whatsapp_access_token}</p>
                )}
              </div>

              {/* Webhook Verify Token */}
              <div className="text-xs">
                <label className="block font-bold text-slate-700 mb-1">Webhook Verify Token *</label>
                <input
                  type="text"
                  value={verifyToken}
                  onChange={(e) => setVerifyToken(e.target.value)}
                  placeholder="siddhi_patient_assistant_verify_token_secure_2026"
                  disabled={!canEdit}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                />
                <p className="text-[10px] text-slate-400 mt-1">
                  Enter this same token in Meta App Dashboard &gt; WhatsApp &gt; Configuration &gt; Webhook
                </p>
              </div>
            </div>

            {/* Patient Booking Flow & Bot Settings Card */}
            <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-4">
              <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
                <div className="w-8 h-8 rounded-lg bg-brand-50 text-brand-600 flex items-center justify-center font-bold">
                  <Bot className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-sm">Patient Booking & Conversation Flow</h3>
                  <p className="text-[11px] text-slate-500">
                    Control doctor selection, welcome messages, and automated reminder triggers
                  </p>
                </div>
              </div>

              {/* Doctor Selection Toggle */}
              <div className="flex items-start justify-between gap-4 p-3 rounded-xl bg-slate-50 border border-slate-100">
                <div className="space-y-0.5">
                  <span className="font-bold text-slate-800 text-xs flex items-center gap-1.5">
                    <UserCheck className="w-3.5 h-3.5 text-brand-600" /> Allow Patient to Select Doctor & Specialization
                  </span>
                  <p className="text-[11px] text-slate-500">
                    When enabled, WhatsApp bot asks patient which doctor or specialty they need (e.g., Cardiologist, General Physician).
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={enableDoctorSelection}
                  onChange={(e) => setEnableDoctorSelection(e.target.checked)}
                  disabled={!canEdit}
                  className="w-4 h-4 text-brand-600 rounded border-slate-300 focus:ring-brand-500 cursor-pointer mt-1"
                />
              </div>

              {/* Default Doctor Selector */}
              <div className="text-xs">
                <label className="block font-bold text-slate-700 mb-1">Primary / Default Doctor</label>
                <SearchableSelect
                  placeholder="-- Automatically Route / First Available Doctor --"
                  searchPlaceholder="Search doctor by name or specialty..."
                  value={defaultDoctorId}
                  onChange={(val) => setDefaultDoctorId(val)}
                  disabled={!canEdit}
                  options={[
                    { value: '', label: '-- Automatically Route / First Available Doctor --' },
                    ...doctors.map((d) => ({
                      value: d.id,
                      label: d.name,
                      subLabel: d.specialty || 'General',
                    })),
                  ]}
                />
                <p className="text-[10px] text-slate-400 mt-1">
                  Used if patient does not specify a doctor or clinic operates a single doctor practice.
                </p>
              </div>

              {/* Greeting Template */}
              <div className="text-xs">
                <label className="block font-bold text-slate-700 mb-1">WhatsApp Greeting / Welcome Message</label>
                <textarea
                  rows={2}
                  value={welcomeMessage}
                  onChange={(e) => setWelcomeMessage(e.target.value)}
                  disabled={!canEdit}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                />
              </div>

              {/* Reminder Lead Time */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div>
                  <label className="block font-bold text-slate-700 mb-1 flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5 text-brand-600" /> Automated Reminder Window
                  </label>
                  <SearchableSelect
                    value={reminderMinutes}
                    onChange={(val) => setReminderMinutes(parseInt(val, 10))}
                    disabled={!canEdit}
                    searchable={false}
                    options={[
                      { value: 30, label: '30 Minutes Before Appointment' },
                      { value: 60, label: '60 Minutes (1 Hour) Before (Recommended)' },
                      { value: 120, label: '2 Hours Before Appointment' },
                      { value: 1440, label: '24 Hours Before Appointment' },
                    ]}
                  />
                </div>

                <div className="flex items-center gap-2 pt-5">
                  <input
                    type="checkbox"
                    id="enableAiBotToggle"
                    checked={enableAiBot}
                    onChange={(e) => setEnableAiBot(e.target.checked)}
                    disabled={!canEdit}
                    className="w-4 h-4 text-brand-600 rounded border-slate-300 focus:ring-brand-500 cursor-pointer"
                  />
                  <label htmlFor="enableAiBotToggle" className="font-bold text-slate-700 cursor-pointer">
                    Enable AI Receptionist on WhatsApp Webhook
                  </label>
                </div>
              </div>
            </div>

            {/* Save Button */}
            {canEdit && (
              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={saving}
                  className="px-6 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-700 text-white font-bold text-sm transition shadow-sm disabled:opacity-50 flex items-center gap-2"
                >
                  <Save className="w-4 h-4" /> {saving ? 'Saving...' : 'Save WhatsApp Configuration'}
                </button>
              </div>
            )}
          </form>

          {/* Test WhatsApp Connection Card */}
          <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-3 text-xs">
            <h4 className="font-bold text-slate-900 text-sm flex items-center gap-2">
              <Send className="w-4 h-4 text-brand-600" /> Test WhatsApp Connection & Message Dispatch
            </h4>
            <p className="text-slate-500 text-[11px]">
              Send a real-time WhatsApp ping message to verify your Meta Cloud API connection and token validity.
            </p>
            <div className="flex flex-col sm:flex-row items-center gap-2">
              <input
                type="tel"
                value={testNumber}
                onChange={(e) => setTestNumber(e.target.value.replace(/[^0-9]/g, ''))}
                placeholder="Country code + phone (e.g. 919823012345)"
                className="w-full sm:w-72 px-3 py-2 rounded-xl border border-slate-200 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-brand-500/20"
              />
              <button
                type="button"
                onClick={handleTestConnection}
                disabled={testingConnection}
                className="w-full sm:w-auto px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold transition flex items-center justify-center gap-1.5 disabled:opacity-50"
              >
                <Send className="w-3.5 h-3.5" />
                {testingConnection ? 'Sending...' : 'Send Live Test Ping'}
              </button>
            </div>
          </div>
        </div>

        {/* Right Col: Interactive Live Phone Preview Mockup */}
        <div className="space-y-4">
          <div className="bg-slate-900 rounded-3xl p-4 shadow-xl border-4 border-slate-800 text-white max-w-sm mx-auto">
            {/* Phone Top Notch */}
            <div className="flex justify-between items-center px-4 py-1 text-[10px] text-slate-400 border-b border-slate-800 mb-2">
              <span>9:41</span>
              <div className="w-16 h-3 bg-black rounded-full" />
              <span>5G 100%</span>
            </div>

            {/* WhatsApp Chat Header */}
            <div className="flex items-center gap-2.5 pb-2 border-b border-slate-800">
              <div className="w-8 h-8 rounded-full bg-emerald-600 flex items-center justify-center font-bold text-xs text-white">
                🩺
              </div>
              <div>
                <p className="font-bold text-xs text-white leading-tight">Clinic AI Assistant</p>
                <p className="text-[10px] text-emerald-400">Online • Automated</p>
              </div>
            </div>

            {/* Chat Messages Mockup */}
            <div className="py-4 space-y-3 text-xs min-h-[380px] bg-slate-950/60 p-2 rounded-xl">
              {/* Patient Message */}
              <div className="flex justify-end">
                <div className="bg-emerald-700 text-white p-2.5 rounded-2xl rounded-tr-none max-w-[85%] text-[11px] shadow">
                  Hi, I want to book an appointment.
                  <span className="block text-[9px] text-emerald-200 text-right mt-0.5">09:41 AM</span>
                </div>
              </div>

              {/* Bot Greeting & Doctor Selection Message */}
              <div className="flex justify-start">
                <div className="bg-slate-800 text-slate-100 p-2.5 rounded-2xl rounded-tl-none max-w-[88%] text-[11px] space-y-1.5 shadow">
                  <p>{welcomeMessage}</p>
                  {enableDoctorSelection && (
                    <div className="p-1.5 rounded bg-slate-900/80 border border-slate-700/60 text-[10px] space-y-0.5">
                      <p className="font-bold text-emerald-400">Available Specializations:</p>
                      {doctors.slice(0, 3).map((d, i) => (
                        <p key={d.id} className="text-slate-300">
                          {i + 1}️⃣ {d.name} ({d.specialty || 'General'})
                        </p>
                      ))}
                    </div>
                  )}
                  <p className="font-semibold text-emerald-300">May I please have your full name?</p>
                  <span className="block text-[9px] text-slate-400 text-right">09:41 AM</span>
                </div>
              </div>

              {/* Patient Name */}
              <div className="flex justify-end">
                <div className="bg-emerald-700 text-white p-2 rounded-2xl rounded-tr-none max-w-[80%] text-[11px] shadow">
                  Aakash Verma
                  <span className="block text-[9px] text-emerald-200 text-right mt-0.5">09:42 AM</span>
                </div>
              </div>

              {/* Bot Slot Selection */}
              <div className="flex justify-start">
                <div className="bg-slate-800 text-slate-100 p-2.5 rounded-2xl rounded-tl-none max-w-[88%] text-[11px] space-y-1 shadow">
                  <p>Thank you, *Aakash*! Here are open consultation slots for tomorrow:</p>
                  <p className="font-mono text-emerald-400 text-[10px]">
                    1️⃣ 10:00 AM • 2️⃣ 10:15 AM • 3️⃣ 11:00 AM
                  </p>
                  <span className="block text-[9px] text-slate-400 text-right">09:42 AM</span>
                </div>
              </div>
            </div>

            {/* Mock input bar */}
            <div className="pt-2 flex items-center gap-2">
              <input
                type="text"
                disabled
                placeholder="Type a message..."
                className="w-full bg-slate-800 text-slate-400 text-[11px] px-3 py-1.5 rounded-full border border-slate-700"
              />
              <div className="w-7 h-7 rounded-full bg-emerald-600 flex items-center justify-center text-white text-xs">
                ➤
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
