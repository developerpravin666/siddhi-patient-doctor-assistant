import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { ConfirmationModal, ConfirmationVariant } from '../components/ConfirmationModal';

export interface ConfirmOptions {
  title: string;
  message: ReactNode;
  description?: ReactNode;
  confirmText?: string;
  cancelText?: string;
  variant?: ConfirmationVariant;
  icon?: 'trash' | 'alert' | 'info' | 'check';
}

interface ConfirmationContextType {
  confirm: (options: ConfirmOptions) => Promise<boolean>;
}

const ConfirmationContext = createContext<ConfirmationContextType | null>(null);

export const ConfirmationProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [modalState, setModalState] = useState<{
    isOpen: boolean;
    options: ConfirmOptions;
    resolve: (value: boolean) => void;
  } | null>(null);

  const confirm = useCallback((options: ConfirmOptions): Promise<boolean> => {
    return new Promise<boolean>((resolve) => {
      setModalState({
        isOpen: true,
        options,
        resolve,
      });
    });
  }, []);

  const handleConfirm = useCallback(() => {
    if (modalState?.resolve) {
      modalState.resolve(true);
    }
    setModalState(null);
  }, [modalState]);

  const handleCancel = useCallback(() => {
    if (modalState?.resolve) {
      modalState.resolve(false);
    }
    setModalState(null);
  }, [modalState]);

  return (
    <ConfirmationContext.Provider value={{ confirm }}>
      {children}
      {modalState && (
        <ConfirmationModal
          isOpen={modalState.isOpen}
          title={modalState.options.title}
          message={modalState.options.message}
          description={modalState.options.description}
          confirmText={modalState.options.confirmText}
          cancelText={modalState.options.cancelText}
          variant={modalState.options.variant}
          icon={modalState.options.icon}
          onConfirm={handleConfirm}
          onCancel={handleCancel}
        />
      )}
    </ConfirmationContext.Provider>
  );
};

export const useConfirm = (): ((options: ConfirmOptions) => Promise<boolean>) => {
  const context = useContext(ConfirmationContext);
  if (!context) {
    throw new Error('useConfirm must be used within a ConfirmationProvider');
  }
  return context.confirm;
};
