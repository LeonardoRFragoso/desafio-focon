import * as Sentry from '@sentry/react';
import type { ReactNode } from 'react';

const SENTRY_DSN = import.meta.env['VITE_SENTRY_DSN'];

/**
 * Sentry ErrorBoundary — catches React render errors.
 * Falls back to a user-friendly error page.
 */
interface ErrorBoundaryProps {
  children: ReactNode;
}

export function SentryErrorBoundary({ children }: ErrorBoundaryProps) {
  if (!SENTRY_DSN) {
    // If Sentry is not configured, just render children without boundary
    return <>{children}</>;
  }

  return (
    <Sentry.ErrorBoundary
      fallback={({ resetError }) => (
        <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 px-4">
          <div className="max-w-md w-full bg-white dark:bg-slate-900 rounded-xl shadow-lg border border-slate-200 dark:border-slate-700 p-8 text-center">
            <div className="text-4xl mb-4">⚠</div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 mb-2">
              Algo deu errado
            </h1>
            <p className="text-sm text-slate-600 dark:text-slate-400 mb-6">
              Ocorreu um erro inesperado. A equipe foi notificada.
            </p>
            <button
              onClick={resetError}
              className="px-4 py-2 bg-focon-600 hover:bg-focon-700 text-white rounded-lg font-medium transition"
            >
              Tentar novamente
            </button>
          </div>
        </div>
      )}
    >
      {children}
    </Sentry.ErrorBoundary>
  );
}
