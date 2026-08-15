import { useRegisterSW } from 'virtual:pwa-register/react';
import { useState } from 'react';

/**
 * PWA update prompt — shows a banner when a new version is available.
 * Uses prompt registration (not auto-update) for controlled updates.
 */
export function PWAUpdatePrompt() {
  const [offlineReady, setOfflineReady] = useState(false);
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    offlineReady: [offlineReadyState, setOfflineReadyState],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW() {
      // SW registered
    },
    onRegisterError(error) {
      console.error('SW registration failed', error);
    },
  });

  const close = () => {
    setOfflineReady(false);
    setNeedRefresh(false);
    setOfflineReadyState(false);
  };

  if (!needRefresh && !offlineReadyState && !offlineReady) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 max-w-sm">
      <div className="bg-surface-primary rounded-xl shadow-lg border border-app-primary p-4">
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-focon-100 dark:bg-focon-900/30 flex items-center justify-center">
            <svg className="w-5 h-5 text-focon-600 dark:text-focon-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </div>
          <div className="flex-1">
            <p className="font-semibold text-app-primary text-sm">
              {needRefresh ? 'Nova versão disponível' : 'Pronto para uso offline'}
            </p>
            <p className="text-xs text-app-muted mt-1">
              {needRefresh ? 'Atualize para a versão mais recente.' : 'O app pode ser usado offline.'}
            </p>
            <div className="flex gap-2 mt-3">
              {needRefresh && (
                <button
                  onClick={() => updateServiceWorker(true)}
                  className="px-3 py-1.5 bg-focon-600 hover:bg-focon-700 text-white rounded-lg text-xs font-medium transition"
                >
                  Atualizar
                </button>
              )}
              <button
                onClick={close}
                className="px-3 py-1.5 border border-app-strong text-app-secondary rounded-lg text-xs font-medium transition hover:bg-hover-surface"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
