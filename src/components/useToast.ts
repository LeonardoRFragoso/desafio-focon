import { useContext } from 'react';
import { ToastContext, type ToastContextValue } from '@/components/Toast';

/**
 * Access the toast system for transient action feedback.
 *
 * Graceful degradation: when no ToastProvider is present (e.g. in isolated
 * component tests), returns a no-op so callers don't crash. In production the
 * provider is always mounted at the App root.
 */
export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    if (import.meta.env.DEV) {
      console.warn('useToast used without ToastProvider — toasts will be no-op');
    }
    return {
      toasts: [],
      showToast: () => {},
      dismissToast: () => {},
    };
  }
  return ctx;
}
