import React, { useState, useEffect, useRef } from 'react';
import { 
  Stethoscope, 
  Sparkles, 
  LogOut, 
  Shield, 
  UserCheck, 
  ClipboardList, 
  Building2, 
  ChevronDown, 
  Check, 
  RotateCcw 
} from 'lucide-react';
import { AdminUser, Tenant } from '../types';
import { getTenants, getActiveTenantId, setActiveTenant } from '../api/client';

interface NavbarProps {
  clinicName?: string;
  currentUser?: AdminUser | null;
  onLogout: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  clinicName = "Medical Clinic",
  currentUser,
  onLogout
}) => {
  const isSuperAdmin = currentUser?.role === 'SUPER_ADMIN';
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [selectedTenant, setSelectedTenant] = useState<Tenant | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [isLoadingTenants, setIsLoadingTenants] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Fetch tenants if user is Super Admin
  useEffect(() => {
    if (!isSuperAdmin) return;
    let isMounted = true;
    setIsLoadingTenants(true);

    getTenants({ page_size: 100 })
      .then((data) => {
        if (!isMounted) return;
        const tenantList = Array.isArray(data) ? data : (data as any).items || [];
        setTenants(tenantList);

        const currentActiveId = getActiveTenantId();
        if (currentActiveId) {
          const matched = tenantList.find((t: Tenant) => t.id === currentActiveId);
          if (matched) {
            setSelectedTenant(matched);
          }
        }
      })
      .catch((err) => {
        console.error('Failed to load tenants for Super Admin switcher:', err);
      })
      .finally(() => {
        if (isMounted) setIsLoadingTenants(false);
      });

    return () => {
      isMounted = false;
    };
  }, [isSuperAdmin]);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelectTenant = (tenant: Tenant | null) => {
    setActiveTenant(tenant);
    setSelectedTenant(tenant);
    setDropdownOpen(false);
    // Reload to refresh all application queries with the new tenant context header
    window.location.reload();
  };

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

  // Active display name
  const displayClinicName = selectedTenant
    ? (selectedTenant.clinic_name || selectedTenant.name)
    : clinicName;

  return (
    <header className="bg-white border-b border-slate-200 sticky top-0 z-30 px-6 py-2.5 flex items-center justify-between shadow-xs">
      <div className="flex items-center space-x-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-brand-600 to-emerald-400 flex items-center justify-center text-white shadow-md shadow-brand-500/20">
          <Stethoscope className="w-5 h-5" />
        </div>
        <div>
          <div className="flex items-center space-x-2">
            <h1 className="font-bold text-slate-900 tracking-tight text-lg">{displayClinicName}</h1>
            <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 text-emerald-800">
              <Sparkles className="w-3 h-3 text-emerald-600" /> WhatsApp AI Online
            </span>
          </div>
          <p className="text-xs text-slate-500 font-medium">Multi-Tenant Doctor-Patient Assistant</p>
        </div>
      </div>

      <div className="flex items-center space-x-3">
        {/* Super Admin Tenant Context Switcher Dropdown */}
        {isSuperAdmin && (
          <div className="relative" ref={dropdownRef}>
            <button
              onClick={() => setDropdownOpen(!dropdownOpen)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-semibold transition shadow-xs ${
                selectedTenant
                  ? 'bg-purple-50 text-purple-800 border-purple-300 hover:bg-purple-100'
                  : 'bg-slate-50 text-slate-700 border-slate-300 hover:bg-slate-100'
              }`}
              title="Switch Clinic Context (Super Admin Impersonation)"
            >
              <Building2 className={`w-3.5 h-3.5 ${selectedTenant ? 'text-purple-600' : 'text-slate-500'}`} />
              <div className="text-left flex items-center gap-1.5">
                <span className="text-[11px] text-slate-500 font-medium hidden sm:inline">Clinic Context:</span>
                <span className="font-bold max-w-[140px] truncate">
                  {selectedTenant ? (selectedTenant.clinic_name || selectedTenant.name) : 'All / Default Tenant'}
                </span>
                {selectedTenant && (
                  <span className="px-1.5 py-0.2 rounded text-[10px] bg-purple-200/80 text-purple-900 font-mono">
                    {selectedTenant.schema_name}
                  </span>
                )}
              </div>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
            </button>

            {dropdownOpen && (
              <div className="absolute right-0 mt-2 w-80 bg-white rounded-2xl shadow-2xl border border-slate-200 py-2 z-50 animate-in fade-in slide-in-from-top-2 duration-150">
                <div className="px-4 py-2 border-b border-slate-100 flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Building2 className="w-4 h-4 text-purple-600" />
                    <span className="text-xs font-bold text-slate-800">Select Clinic / Tenant</span>
                  </div>
                  {selectedTenant && (
                    <button
                      onClick={() => handleSelectTenant(null)}
                      className="text-[11px] text-purple-600 hover:text-purple-800 font-semibold flex items-center gap-1 hover:underline"
                    >
                      <RotateCcw className="w-3 h-3" />
                      Reset to Default
                    </button>
                  )}
                </div>

                <div className="max-h-72 overflow-y-auto py-1 divide-y divide-slate-50">
                  {/* Default / All Clinics Option */}
                  <button
                    onClick={() => handleSelectTenant(null)}
                    className={`w-full px-4 py-2.5 text-left text-xs flex items-center justify-between transition hover:bg-slate-50 ${
                      !selectedTenant ? 'bg-purple-50/60 font-bold text-purple-900' : 'text-slate-700'
                    }`}
                  >
                    <div>
                      <p className="font-semibold text-slate-800">Default Clinic Context</p>
                      <p className="text-[10px] text-slate-400">First Active Tenant in system</p>
                    </div>
                    {!selectedTenant && <Check className="w-4 h-4 text-purple-600" />}
                  </button>

                  {/* List of Tenants */}
                  {isLoadingTenants ? (
                    <div className="p-4 text-center text-xs text-slate-400">Loading clinics...</div>
                  ) : tenants.length === 0 ? (
                    <div className="p-4 text-center text-xs text-slate-400">No clinics found.</div>
                  ) : (
                    tenants.map((t) => {
                      const isSelected = selectedTenant?.id === t.id;
                      return (
                        <button
                          key={t.id}
                          onClick={() => handleSelectTenant(t)}
                          className={`w-full px-4 py-2 text-left text-xs flex items-center justify-between transition hover:bg-slate-50 ${
                            isSelected ? 'bg-purple-50/60 text-purple-900 font-bold' : 'text-slate-700'
                          }`}
                        >
                          <div className="truncate pr-2">
                            <p className="font-semibold text-slate-800 truncate">{t.clinic_name || t.name}</p>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <span className="font-mono text-[10px] text-slate-400 bg-slate-100 px-1.5 py-0.2 rounded">
                                {t.schema_name}
                              </span>
                              <span className={`text-[9px] px-1.5 py-0.2 rounded-full font-bold ${
                                t.status === 'ACTIVE' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'
                              }`}>
                                {t.status}
                              </span>
                            </div>
                          </div>
                          {isSelected && <Check className="w-4 h-4 text-purple-600 shrink-0" />}
                        </button>
                      );
                    })
                  )}
                </div>

                <div className="px-4 py-2 border-t border-slate-100 bg-slate-50 rounded-b-2xl">
                  <p className="text-[10px] text-slate-500 leading-tight">
                    Super Admin changes will apply strictly to the selected clinic tenant schema.
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

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
          <span className="hidden lg:inline">Sign Out</span>
        </button>
      </div>
    </header>
  );
};
