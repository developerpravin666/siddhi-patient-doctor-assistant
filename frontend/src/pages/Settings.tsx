import React, { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import { 
  Building2, 
  MapPin, 
  User, 
  Lock, 
  Save, 
  CheckCircle2, 
  AlertCircle,
  ShieldCheck,
  BellRing
} from 'lucide-react';
import { Clinic, AppContextType } from '../types';
import { getClinics, updateClinic, updateMyProfileApi, getStoredUser } from '../api/client';

interface SettingsProps {
  clinic?: Clinic;
}

export const SettingsPage: React.FC<SettingsProps> = (props) => {
  const outlet = useOutletContext<AppContextType>();
  const [activeTab, setActiveTab] = useState<'clinic' | 'profile'>('clinic');
  const [clinicData, setClinicData] = useState<Clinic | null>(props.clinic || null);
  const [currentUser, setCurrentUser] = useState(() => outlet?.currentUser || getStoredUser());

  // Clinic Profile Form state
  const [clinicName, setClinicName] = useState('');
  const [clinicPhone, setClinicPhone] = useState('');
  const [clinicAddress, setClinicAddress] = useState('');
  const [timezone, setTimezone] = useState('Asia/Kolkata');
  const [consultationHours, setConsultationHours] = useState('');
  const [isSavingClinic, setIsSavingClinic] = useState(false);

  // User Profile Form state
  const [fullName, setFullName] = useState(currentUser?.full_name || '');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  // Alerts
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  // Load clinic data
  useEffect(() => {
    getClinics()
      .then((data) => {
        if (data && data.length > 0) {
          const c = data[0];
          setClinicData(c);
          setClinicName(c.name || '');
          setClinicPhone(c.phone || '');
          setClinicAddress(c.address || '');
          setTimezone(c.timezone || 'Asia/Kolkata');
          setConsultationHours(c.consultation_hours || '');
        }
      })
      .catch((err) => {
        console.error('Failed to load clinic settings:', err);
      });
  }, []);

  useEffect(() => {
    if (currentUser?.full_name) {
      setFullName(currentUser.full_name);
    }
  }, [currentUser]);

  const handleSaveClinic = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clinicData) return;

    if (!clinicName.trim()) {
      showToast('Clinic Name is required', 'error');
      return;
    }
    if (!clinicAddress.trim()) {
      showToast('Clinic Physical Address is required', 'error');
      return;
    }

    try {
      setIsSavingClinic(true);
      const updated = await updateClinic(clinicData.id, {
        name: clinicName.trim(),
        phone: clinicPhone.trim() || undefined,
        address: clinicAddress.trim(),
        timezone: timezone.trim() || 'Asia/Kolkata',
        consultation_hours: consultationHours.trim() || undefined,
      });
      setClinicData(updated);
      showToast('Clinic profile updated successfully!', 'success');
    } catch (err: any) {
      showToast(err.response?.data?.detail || 'Failed to update clinic profile', 'error');
    } finally {
      setIsSavingClinic(false);
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!fullName.trim()) {
      showToast('Full Name cannot be empty', 'error');
      return;
    }

    if (newPassword && newPassword.length < 6) {
      showToast('New password must be at least 6 characters', 'error');
      return;
    }

    if (newPassword && newPassword !== confirmPassword) {
      showToast('Password confirmation does not match', 'error');
      return;
    }

    try {
      setIsSavingProfile(true);
      const updatedUser = await updateMyProfileApi({
        full_name: fullName.trim(),
        password: newPassword.trim() || undefined,
      });
      setCurrentUser(updatedUser);
      setNewPassword('');
      setConfirmPassword('');
      showToast('Your profile has been updated successfully!', 'success');
    } catch (err: any) {
      showToast(err.response?.data?.detail || 'Failed to update account profile', 'error');
    } finally {
      setIsSavingProfile(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Toast Alert */}
      {toast && (
        <div
          className={`p-3.5 rounded-xl border text-xs font-semibold flex items-center justify-between transition shadow-sm ${
            toast.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}
        >
          <div className="flex items-center gap-2">
            {toast.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-600" />
            )}
            <span>{toast.message}</span>
          </div>
          <button onClick={() => setToast(null)} className="font-bold opacity-70 hover:opacity-100">
            ✕
          </button>
        </div>
      )}

      <div>
        <h2 className="text-xl font-bold text-slate-900">Clinic Profile & Practice Settings</h2>
        <p className="text-xs text-slate-500">
          Manage clinic facility metadata, doctor consultation timings, and update your administrator account details.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-3">
        <button
          onClick={() => setActiveTab('clinic')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 ${
            activeTab === 'clinic'
              ? 'bg-indigo-600 text-white shadow-xs'
              : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          <Building2 className="w-4 h-4" />
          Clinic Facility Profile
        </button>

        <button
          onClick={() => setActiveTab('profile')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 ${
            activeTab === 'profile'
              ? 'bg-indigo-600 text-white shadow-xs'
              : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          <User className="w-4 h-4" />
          Admin Account & Password
        </button>
      </div>

      {/* Tab 1: Clinic Profile Form */}
      {activeTab === 'clinic' && (
        <form onSubmit={handleSaveClinic} className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-sm space-y-5">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
              <MapPin className="w-4 h-4 text-indigo-600" /> Clinic Practice Metadata
            </h3>
            <span className="text-[11px] text-slate-400">Available to patients on WhatsApp & Appointment slips</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div>
              <label className="block text-slate-600 font-bold mb-1">
                Clinic Name <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <input
                  type="text"
                  required
                  value={clinicName}
                  onChange={(e) => setClinicName(e.target.value)}
                  placeholder="e.g. City Care Polyclinic"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-800 font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-slate-600 font-bold mb-1">
                Contact Phone
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={clinicPhone}
                  onChange={(e) => setClinicPhone(e.target.value)}
                  placeholder="e.g. +91 98765 43210"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-800 font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                />
              </div>
            </div>

            <div className="md:col-span-2">
              <label className="block text-slate-600 font-bold mb-1">
                Clinic Physical Address <span className="text-rose-500">*</span>
              </label>
              <textarea
                required
                rows={2}
                value={clinicAddress}
                onChange={(e) => setClinicAddress(e.target.value)}
                placeholder="Suite number, building, street, landmark, city"
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-800 font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block text-slate-600 font-bold mb-1">
                Timezone
              </label>
              <select
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-800 font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              >
                <option value="Asia/Kolkata">Asia/Kolkata (IST +5:30)</option>
                <option value="Asia/Dubai">Asia/Dubai (GST +4:00)</option>
                <option value="Europe/London">Europe/London (GMT/BST)</option>
                <option value="America/New_York">America/New_York (EST/EDT)</option>
                <option value="UTC">UTC (Universal)</option>
              </select>
            </div>

            <div>
              <label className="block text-slate-600 font-bold mb-1">
                Consultation Timings
              </label>
              <input
                type="text"
                value={consultationHours}
                onChange={(e) => setConsultationHours(e.target.value)}
                placeholder="e.g. Mon-Sat: 9:00 AM - 1:00 PM, 4:00 PM - 7:30 PM"
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-800 font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              />
            </div>
          </div>

          <div className="flex items-center justify-end pt-3 border-t border-slate-100">
            <button
              type="submit"
              disabled={isSavingClinic}
              className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs transition shadow-sm flex items-center gap-2 disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              {isSavingClinic ? 'Saving...' : 'Save Clinic Profile'}
            </button>
          </div>
        </form>
      )}

      {/* Tab 2: User Account & Password */}
      {activeTab === 'profile' && (
        <form onSubmit={handleSaveProfile} className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-sm space-y-5">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
              <User className="w-4 h-4 text-indigo-600" /> Admin Account Profile
            </h3>
            <span className="text-[11px] text-slate-400">Update personal name and account password</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div>
              <label className="block text-slate-600 font-bold mb-1">
                Username
              </label>
              <input
                type="text"
                readOnly
                value={currentUser?.username || ''}
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-100 border border-slate-200 text-slate-500 font-mono cursor-not-allowed"
              />
              <span className="text-[10px] text-slate-400 mt-1 block">Username cannot be changed.</span>
            </div>

            <div>
              <label className="block text-slate-600 font-bold mb-1">
                Account Role
              </label>
              <div className="px-3.5 py-2.5 rounded-xl bg-slate-100 border border-slate-200 text-slate-700 font-bold flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-indigo-600" />
                <span>{currentUser?.role || 'CLINIC_ADMIN'}</span>
              </div>
            </div>

            <div className="md:col-span-2">
              <label className="block text-slate-600 font-bold mb-1">
                Full Name <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="e.g. Dr. Jane Doe"
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-800 font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              />
            </div>

            <div className="pt-2 md:col-span-2 border-t border-slate-100">
              <h4 className="font-bold text-slate-800 text-xs flex items-center gap-1.5 mb-3">
                <Lock className="w-3.5 h-3.5 text-indigo-600" /> Change Password (Leave blank to keep current)
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-slate-500 font-semibold mb-1">New Password</label>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Min 6 characters"
                    className="w-full px-3.5 py-2 rounded-xl bg-slate-50 border border-slate-200 text-slate-800 font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-500 font-semibold mb-1">Confirm New Password</label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Re-enter new password"
                    className="w-full px-3.5 py-2 rounded-xl bg-slate-50 border border-slate-200 text-slate-800 font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end pt-3 border-t border-slate-100">
            <button
              type="submit"
              disabled={isSavingProfile}
              className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs transition shadow-sm flex items-center gap-2 disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              {isSavingProfile ? 'Updating...' : 'Update Profile & Password'}
            </button>
          </div>
        </form>
      )}

      {/* WhatsApp Reminders Automation Card (Informational only for Clinic Admin) */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
            <BellRing className="w-4 h-4 text-emerald-600" /> 1-Hour Automated WhatsApp Reminders
          </h3>
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
            Meta Cloud API &bull; Active
          </span>
        </div>

        <p className="text-xs text-slate-500 leading-relaxed">
          Patients receive an automated reminder on WhatsApp exactly 1 hour prior to their scheduled consultation, complete with doctor details and clinic address.
        </p>

        <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 space-y-2 text-xs">
          <div className="flex items-center justify-between">
            <span className="font-bold text-slate-700 font-mono text-[11px]">Meta Approved Template: appointment_reminder_1hr</span>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-200 text-slate-700">
              CATEGORY: UTILITY
            </span>
          </div>
          <p className="text-slate-600 font-mono text-[11px] whitespace-pre-wrap bg-white p-3 rounded-lg border border-slate-200">
{`Hello {{1}},

This is a friendly reminder that your appointment with {{2}} is scheduled in 1 hour at {{3}}.

📍 Clinic Location: {{4}}

Please arrive 10 minutes early. If you need directions or need to reschedule, reply to this message.`}
          </p>
          <p className="text-[10px] text-slate-400">
            Note: WhatsApp API credentials, Webhook endpoints, and Meta Cloud tokens are managed globally by the Super Admin in the Platform Administration portal.
          </p>
        </div>
      </div>
    </div>
  );
};
