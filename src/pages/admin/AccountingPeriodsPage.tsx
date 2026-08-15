import { useState, useEffect, useCallback } from 'react';
import { accountingPeriodsAPI } from '@/lib/supabase/api';
import { supabase } from '@/lib/supabase/client';
import { mapDatabaseError } from '@/lib/errors';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Modal } from '@/components/Modal';
import type { AccountingPeriod } from '@/types/database';

export function AccountingPeriodsPage() {
  const [periods, setPeriods] = useState<AccountingPeriod[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [closeTarget, setCloseTarget] = useState<AccountingPeriod | null>(null);
  const [reopenTarget, setReopenTarget] = useState<AccountingPeriod | null>(null);
  const [selectedPeriod, setSelectedPeriod] = useState<AccountingPeriod | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const fetchPeriods = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const { data, error: err } = await accountingPeriodsAPI.list();
      if (err) throw err;
      setPeriods((data as AccountingPeriod[]) || []);
    } catch (err) {
      setError(err instanceof Error ? mapDatabaseError(err) : 'Erro ao carregar fechamentos');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchPeriods();
  }, [fetchPeriods]);

  const formatDateTime = (d: string | null) =>
    d ? new Date(d).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—';

  if (loading) {
    return (
      <div className="flex justify-center items-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-focon-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-app-primary">Fechamentos Mensais</h2>
        <p className="text-app-muted">
          Feche períodos para bloquear alterações em apontamentos. Períodos fechados impedem
          criação, edição e exclusão de apontamentos por profissionais não-administradores.
        </p>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-4">
          <p className="text-sm font-medium text-red-800 dark:text-red-400">{error}</p>
        </div>
      )}
      {actionError && (
        <div className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-4">
          <p className="text-sm font-medium text-red-800 dark:text-red-400">{actionError}</p>
        </div>
      )}

      {periods.length === 0 ? (
        <div className="rounded-xl border border-app-primary p-12 text-center bg-surface-secondary/50">
          <p className="text-app-muted">Nenhum período de fechamento registrado</p>
          <p className="text-sm text-app-muted mt-2">
            Períodos são criados automaticamente quando há apontamentos. Feche um período
            para bloquear alterações.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-app-primary shadow-sm">
          <table className="w-full">
            <thead className="bg-surface-secondary border-b border-app-primary">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-semibold text-app-primary">Período</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-app-primary">Status</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-app-primary">Fechado por</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-app-primary">Fechado em</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-app-primary">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-table-divider">
              {periods.map((p) => (
                <tr
                  key={p.id}
                  onClick={() => setSelectedPeriod(p)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setSelectedPeriod(p);
                    }
                  }}
                  tabIndex={0}
                  role="button"
                  aria-label={`Ver detalhes do período ${p.period_key}`}
                  className="hover:bg-hover-surface transition cursor-pointer focus:outline-none focus:ring-2 focus:ring-inset focus:ring-focon-600"
                >
                  <td className="px-4 py-3 text-sm text-app-primary font-medium">{p.period_key}</td>
                  <td className="px-4 py-3 text-sm">
                    <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-semibold ${p.status === 'closed' ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400' : 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'}`}>
                      {p.status === 'closed' ? 'Fechado' : 'Aberto'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-app-secondary">
                    {p.closed_by_profile?.full_name || '—'}
                  </td>
                  <td className="px-4 py-3 text-sm text-app-secondary">{formatDateTime(p.closed_at)}</td>
                  <td className="px-4 py-3 text-sm" onClick={(e) => e.stopPropagation()}>
                    {p.status === 'open' ? (
                      <button
                        onClick={() => setCloseTarget(p)}
                        disabled={busy}
                        className="px-2.5 py-1 rounded-md text-xs font-medium border border-red-300 dark:border-red-700 text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition disabled:opacity-50"
                      >
                        Fechar período
                      </button>
                    ) : (
                      <button
                        onClick={() => setReopenTarget(p)}
                        disabled={busy}
                        className="px-2.5 py-1 rounded-md text-xs font-medium border border-app-strong text-app-secondary hover:bg-hover-surface transition disabled:opacity-50"
                      >
                        Reabrir período
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {closeTarget && (
        <ConfirmDialog
          open
          title="Fechar período"
          destructive
          confirmLabel="Fechar"
          onClose={() => setCloseTarget(null)}
          onConfirm={async () => {
            setBusy(true);
            try {
              const { error: err } = await accountingPeriodsAPI.close(closeTarget.period_key);
              if (err) {
                setActionError(mapDatabaseError(err));
                return;
              }
              await fetchPeriods();
            } finally {
              setBusy(false);
            }
          }}
          message={
            <>
              <p>Fechar o período <strong>{closeTarget.period_key}</strong>?</p>
              <p className="mt-2">
                Profissionais não poderão criar, editar ou excluir apontamentos neste período.
                Aprovações/rejeições administrativas também serão bloqueadas.
              </p>
            </>
          }
        />
      )}

      {reopenTarget && (
        <ConfirmDialog
          open
          title="Reabrir período"
          confirmLabel="Reabrir"
          onClose={() => setReopenTarget(null)}
          onConfirm={async () => {
            setBusy(true);
            try {
              const { error: err } = await accountingPeriodsAPI.reopen(reopenTarget.period_key);
              if (err) {
                setActionError(mapDatabaseError(err));
                return;
              }
              await fetchPeriods();
            } finally {
              setBusy(false);
            }
          }}
          message={
            <>
              <p>Reabrir o período <strong>{reopenTarget.period_key}</strong>?</p>
              <p className="mt-2">Alterações em apontamentos serão permitidas novamente.</p>
            </>
          }
        />
      )}

      {selectedPeriod && (
        <AccountingPeriodDetailsModal
          period={selectedPeriod}
          onClose={() => setSelectedPeriod(null)}
        />
      )}
    </div>
  );
}

interface AccountingPeriodDetailsModalProps {
  period: AccountingPeriod;
  onClose: () => void;
}

function AccountingPeriodDetailsModal({ period, onClose }: AccountingPeriodDetailsModalProps) {
  const [stats, setStats] = useState<{
    entryCount: number;
    totalMinutes: number;
    approvedMinutes: number;
    pendingMinutes: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const parts = period.period_key.split('-');
        const year = parts[0] ?? '';
        const month = parts[1] ?? '';
        const startDate = `${year}-${month}-01`;
        const endDay = new Date(parseInt(year), parseInt(month), 0).getDate();
        const endDate = `${year}-${month}-${String(endDay).padStart(2, '0')}`;

        const { data } = await supabase
          .from('time_entries')
          .select('duration_minutes, approval_status')
          .gte('entry_date', startDate)
          .lte('entry_date', endDate);
        if (cancelled) return;

        const entries = (data as { duration_minutes: number; approval_status: string }[]) || [];
        const totalMinutes = entries.reduce((s, e) => s + e.duration_minutes, 0);
        const approvedMinutes = entries
          .filter((e) => e.approval_status === 'approved')
          .reduce((s, e) => s + e.duration_minutes, 0);
        const pendingMinutes = entries
          .filter((e) => e.approval_status === 'pending')
          .reduce((s, e) => s + e.duration_minutes, 0);

        setStats({
          entryCount: entries.length,
          totalMinutes,
          approvedMinutes,
          pendingMinutes,
        });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [period.period_key]);

  const formatDateTime = (d: string | null) =>
    d ? new Date(d).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—';
  const formatDate = (d: string) => new Date(d).toLocaleDateString('pt-BR');
  const formatDuration = (minutes: number) => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}h ${mins}m`;
  };

  return (
    <Modal open onClose={onClose} title="Detalhes do Período" maxWidth="max-w-2xl">
      {loading ? (
        <div className="flex justify-center items-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-focon-600"></div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <p className="text-xs font-medium text-app-muted uppercase tracking-wide">Período</p>
              <p className="text-sm text-app-primary font-medium">{period.period_key}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-app-muted uppercase tracking-wide">Status</p>
              <span className={`inline-block mt-1 px-2.5 py-1 rounded-full text-xs font-semibold ${period.status === 'closed' ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400' : 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'}`}>
                {period.status === 'closed' ? 'Fechado' : 'Aberto'}
              </span>
            </div>
            <div>
              <p className="text-xs font-medium text-app-muted uppercase tracking-wide">Fechado por</p>
              <p className="text-sm text-app-secondary">{period.closed_by_profile?.full_name || '—'}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-app-muted uppercase tracking-wide">Fechado em</p>
              <p className="text-sm text-app-secondary">{formatDateTime(period.closed_at)}</p>
            </div>
          </div>

          <div className="border-t border-app-primary pt-4">
            <h3 className="text-sm font-semibold text-app-primary mb-3">Apontamentos do Período</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="rounded-lg bg-surface-secondary p-3">
                <p className="text-xs text-app-muted">Quantidade</p>
                <p className="text-sm font-semibold text-app-primary">{stats?.entryCount ?? 0}</p>
              </div>
              <div className="rounded-lg bg-surface-secondary p-3">
                <p className="text-xs text-app-muted">Total</p>
                <p className="text-sm font-semibold text-app-primary">{formatDuration(stats?.totalMinutes ?? 0)}</p>
              </div>
              <div className="rounded-lg bg-green-50 dark:bg-green-900/20 p-3">
                <p className="text-xs text-green-700 dark:text-green-400">Aprovadas</p>
                <p className="text-sm font-semibold text-green-800 dark:text-green-300">{formatDuration(stats?.approvedMinutes ?? 0)}</p>
              </div>
              <div className="rounded-lg bg-yellow-50 dark:bg-yellow-900/20 p-3">
                <p className="text-xs text-yellow-700 dark:text-yellow-400">Pendentes</p>
                <p className="text-sm font-semibold text-yellow-800 dark:text-yellow-300">{formatDuration(stats?.pendingMinutes ?? 0)}</p>
              </div>
            </div>
          </div>

          <div className="border-t border-app-primary pt-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <p className="text-xs font-medium text-app-muted uppercase tracking-wide">Criado em</p>
                <p className="text-sm text-app-secondary">{formatDate(period.created_at)}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-app-muted uppercase tracking-wide">Atualizado em</p>
                <p className="text-sm text-app-secondary">{formatDate(period.updated_at)}</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}
