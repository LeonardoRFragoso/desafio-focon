import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase/client';

interface StatusState {
  supabaseReachable: 'ok' | 'fail' | 'checking';
  realtimeConnected: 'ok' | 'fail' | 'checking';
  lastFetch: string | null;
  appError: string | null;
}

export function SystemStatusPage() {
  const [status, setStatus] = useState<StatusState>({
    supabaseReachable: 'checking',
    realtimeConnected: 'checking',
    lastFetch: null,
    appError: null,
  });

  const checkStatus = useCallback(async () => {
    setStatus((prev) => ({ ...prev, supabaseReachable: 'checking', realtimeConnected: 'checking' }));

    // Check Supabase reachable
    try {
      const { error } = await supabase.from('projects').select('id').limit(1);
      if (error && error.code !== 'PGRST116') throw error;
      setStatus((prev) => ({
        ...prev,
        supabaseReachable: 'ok',
        lastFetch: new Date().toLocaleString('pt-BR'),
      }));
    } catch {
      setStatus((prev) => ({ ...prev, supabaseReachable: 'fail' }));
    }

    // Check realtime
    try {
      const channel = supabase.channel('health-check');
      const connected = await new Promise<boolean>((resolve) => {
        const timeout = setTimeout(() => resolve(false), 5000);
        channel.subscribe((state) => {
          if (state === 'SUBSCRIBED') {
            clearTimeout(timeout);
            resolve(true);
          }
        });
      });
      channel.unsubscribe();
      setStatus((prev) => ({ ...prev, realtimeConnected: connected ? 'ok' : 'fail' }));
    } catch {
      setStatus((prev) => ({ ...prev, realtimeConnected: 'fail' }));
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    checkStatus();
  }, [checkStatus]);

  const statusConfig: Record<string, { label: string; color: string; icon: string }> = {
    ok: { label: 'OK', color: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400', icon: '✓' },
    fail: { label: 'Falha', color: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400', icon: '✕' },
    checking: { label: 'Verificando...', color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400', icon: '⏳' },
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-app-primary">Status do Sistema</h2>
          <p className="text-app-muted">Indicadores de disponibilidade</p>
        </div>
        <button
          onClick={checkStatus}
          className="px-4 py-2 border border-app-strong text-app-secondary hover:bg-hover-surface rounded-lg font-medium transition text-sm"
        >
          Atualizar
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-surface-primary rounded-xl border border-app-primary p-6 shadow-sm">
          <div className="flex justify-between items-center">
            <div>
              <p className="text-sm font-medium text-app-muted">Supabase (API + DB)</p>
              <p className="text-xs text-app-muted mt-1">
                {status.lastFetch ? `Última verificação: ${status.lastFetch}` : '—'}
              </p>
            </div>
            <span className={`px-3 py-1 rounded-full text-sm font-semibold ${statusConfig[status.supabaseReachable]?.color ?? ''}`}>
              {statusConfig[status.supabaseReachable]?.icon ?? '?'} {statusConfig[status.supabaseReachable]?.label ?? '—'}
            </span>
          </div>
        </div>

        <div className="bg-surface-primary rounded-xl border border-app-primary p-6 shadow-sm">
          <div className="flex justify-between items-center">
            <div>
              <p className="text-sm font-medium text-app-muted">Realtime (WebSocket)</p>
              <p className="text-xs text-app-muted mt-1">Notificações em tempo real</p>
            </div>
            <span className={`px-3 py-1 rounded-full text-sm font-semibold ${statusConfig[status.realtimeConnected]?.color ?? ''}`}>
              {statusConfig[status.realtimeConnected]?.icon ?? '?'} {statusConfig[status.realtimeConnected]?.label ?? '—'}
            </span>
          </div>
        </div>
      </div>

      <div className="bg-surface-primary rounded-xl border border-app-primary p-6 shadow-sm">
        <h3 className="text-lg font-semibold text-app-primary mb-4">Detalhes</h3>
        <dl className="space-y-2 text-sm">
          <div className="flex justify-between">
            <dt className="text-app-muted">Última busca de dados bem-sucedida</dt>
            <dd className="font-medium text-app-primary">{status.lastFetch || '—'}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-app-muted">Estado de erro da aplicação</dt>
            <dd className={`font-medium ${status.appError ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>
              {status.appError || 'Sem erros'}
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-app-muted">Sentry</dt>
            <dd className="font-medium text-app-primary">
              {import.meta.env['VITE_SENTRY_DSN'] ? 'Ativado' : 'Desativado (DSN não configurado)'}
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-app-muted">PWA</dt>
            <dd className="font-medium text-app-primary">
              {'serviceWorker' in navigator ? 'Suportado' : 'Não suportado'}
            </dd>
          </div>
        </dl>
      </div>
    </div>
  );
}
