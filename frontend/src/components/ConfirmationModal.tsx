import React, { useEffect } from 'react';
import { 
  Trash2, 
  AlertTriangle, 
  HelpCircle, 
  CheckCircle2, 
  X, 
  Loader2 
} from 'lucide-react';

export type ConfirmationVariant = 'danger' | 'warning' | 'info' | 'success';

export interface ConfirmationModalProps {
  isOpen: boolean;
  title: string;
  message: React.ReactNode;
  description?: React.ReactNode;
  confirmText?: string;
  cancelText?: string;
  variant?: ConfirmationVariant;
  icon?: 'trash' | 'alert' | 'info' | 'check';
  loading?: boolean;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
}

export const ConfirmationModal: React.FC<ConfirmationModalProps> = ({
  isOpen,
  title,
  message,
  description,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  variant = 'danger',
  icon,
  loading = false,
  onConfirm,
  onCancel,
}) => {
  // Close on Escape key press
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !loading) {
        onCancel();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, loading, onCancel]);

  if (!isOpen) return null;

  // Icon configuration
  const renderIcon = () => {
    const chosen = icon || (variant === 'danger' ? 'trash' : variant === 'warning' ? 'alert' : variant === 'success' ? 'check' : 'info');
    switch (chosen) {
      case 'trash':
        return <Trash2 className="w-6 h-6 text-rose-600" />;
      case 'alert':
        return <AlertTriangle className="w-6 h-6 text-amber-600" />;
      case 'check':
        return <CheckCircle2 className="w-6 h-6 text-emerald-600" />;
      case 'info':
      default:
        return <HelpCircle className="w-6 h-6 text-indigo-600" />;
    }
  };

  // Color theme per variant
  const getTheme = () => {
    switch (variant) {
      case 'danger':
        return {
          iconBg: 'bg-rose-50 border-rose-200/80 ring-8 ring-rose-50/50',
          confirmBtn: 'bg-rose-600 hover:bg-rose-700 text-white focus:ring-rose-500/30',
          badge: 'bg-rose-50 border-rose-200 text-rose-800',
        };
      case 'warning':
        return {
          iconBg: 'bg-amber-50 border-amber-200/80 ring-8 ring-amber-50/50',
          confirmBtn: 'bg-amber-600 hover:bg-amber-700 text-white focus:ring-amber-500/30',
          badge: 'bg-amber-50 border-amber-200 text-amber-800',
        };
      case 'success':
        return {
          iconBg: 'bg-emerald-50 border-emerald-200/80 ring-8 ring-emerald-50/50',
          confirmBtn: 'bg-emerald-600 hover:bg-emerald-700 text-white focus:ring-emerald-500/30',
          badge: 'bg-emerald-50 border-emerald-200 text-emerald-800',
        };
      case 'info':
      default:
        return {
          iconBg: 'bg-indigo-50 border-indigo-200/80 ring-8 ring-indigo-50/50',
          confirmBtn: 'bg-indigo-600 hover:bg-indigo-700 text-white focus:ring-indigo-500/30',
          badge: 'bg-indigo-50 border-indigo-200 text-indigo-800',
        };
    }
  };

  const theme = getTheme();

  return (
    <div 
      className="fixed inset-0 z-[100] bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 transition-all duration-150 animate-in fade-in"
      onClick={() => {
        if (!loading) onCancel();
      }}
    >
      <div
        className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-100 transform transition-all duration-200 scale-100 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Header Row with Icon and Close Button */}
        <div className="flex items-start justify-between">
          <div className={`w-12 h-12 rounded-2xl border flex items-center justify-center transition ${theme.iconBg}`}>
            {renderIcon()}
          </div>
          <button
            onClick={onCancel}
            disabled={loading}
            className="text-slate-400 hover:text-slate-600 w-8 h-8 rounded-full flex items-center justify-center hover:bg-slate-100 transition disabled:opacity-50"
            title="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="space-y-2">
          <h3 className="text-lg font-extrabold text-slate-900 leading-snug">
            {title}
          </h3>
          <div className="text-sm text-slate-600 leading-relaxed">
            {message}
          </div>

          {description && (
            <div className={`p-3 rounded-xl border text-xs font-medium leading-relaxed mt-2 ${theme.badge}`}>
              {description}
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="px-4 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50 transition disabled:opacity-50"
          >
            {cancelText}
          </button>

          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className={`px-5 py-2.5 rounded-xl text-xs font-bold shadow-xs transition flex items-center gap-2 focus:outline-none focus:ring-2 disabled:opacity-60 ${theme.confirmBtn}`}
          >
            {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            <span>{loading ? 'Processing...' : confirmText}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
