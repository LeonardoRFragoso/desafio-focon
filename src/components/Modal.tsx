import { type ReactNode, useEffect, useRef } from 'react';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  labelledById?: string;
  maxWidth?: string;
}

/**
 * Accessible modal dialog. Closes on backdrop click and Escape; traps focus
 * loosely by focusing the close button on open. Avoids window.confirm/alert.
 */
export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  labelledById = 'modal-title',
  maxWidth = 'max-w-lg',
}: ModalProps) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKey);
    closeRef.current?.focus();
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby={labelledById}
    >
      <div
        className={`bg-surface-primary rounded-xl shadow-lg w-full ${maxWidth} max-h-[90vh] overflow-y-auto`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-surface-primary border-b border-app-primary p-6 flex justify-between items-center">
          <h2 id={labelledById} className="text-xl font-bold text-app-primary">
            {title}
          </h2>
          <button
            ref={closeRef}
            onClick={onClose}
            className="text-app-muted hover:text-app-secondary text-2xl leading-none"
            aria-label="Fechar modal"
          >
            ×
          </button>
        </div>
        <div className="p-6 space-y-4">{children}</div>
        {footer && (
          <div className="sticky bottom-0 bg-surface-primary border-t border-app-primary p-6 flex justify-end gap-3">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
