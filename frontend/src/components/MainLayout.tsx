import React, { useState, useEffect, useRef } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { Navbar } from './Navbar';
import { Sidebar } from './Sidebar';
import { getStoredUser, logoutApi, getMe } from '../api/client';
import { AdminUser, AppContextType } from '../types';

export const MainLayout: React.FC = () => {
  const navigate = useNavigate();
  const [currentUser, setCurrentUser] = useState<AdminUser | null>(() => getStoredUser());
  const authCheckedRef = useRef(false);

  // Verify authentication token once on mount
  useEffect(() => {
    const stored = getStoredUser();
    if (!stored) {
      navigate('/login', { replace: true });
      return;
    }

    if (authCheckedRef.current) return;
    authCheckedRef.current = true;

    getMe()
      .then((freshUser) => {
        setCurrentUser(freshUser);
        localStorage.setItem('siddhi_user', JSON.stringify(freshUser));
      })
      .catch(() => {
        logoutApi();
        setCurrentUser(null);
        navigate('/login', { replace: true });
      });
  }, [navigate]);

  const handleLogout = () => {
    logoutApi();
    setCurrentUser(null);
    navigate('/login', { replace: true });
  };

  const contextValue: AppContextType = {
    currentUser,
    userRole: currentUser?.role || 'RECEPTIONIST',
    handleLogout
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <Navbar 
        currentUser={currentUser}
        onLogout={handleLogout}
      />

      <div className="flex-1 flex flex-row">
        <Sidebar 
          currentUser={currentUser}
          userRole={currentUser?.role}
        />

        <main className="flex-1 p-6 max-w-7xl mx-auto w-full">
          <Outlet context={contextValue} />
        </main>
      </div>
    </div>
  );
};
