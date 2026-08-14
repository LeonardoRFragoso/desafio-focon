import { useState, useEffect, useCallback } from 'react';
import { accountingPeriodsAPI } from '@/lib/supabase/api';
import { mapDatabaseError } from '@/lib/errors';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import type { AccountingPeriod } from '@/types/database';

interface PeriodRow extends AccountingPeriod {}

export function AccountingPeriodsPage() {
  const [periods, setPeriods] = useState<PeriodRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [closeTarget, setCloseTarget] = useState<PeriodRow | null>(null);
  const [reopenTarget, setReopenTarget] = useState<PeriodRow | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const fetchPeriods = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const { data, error: err } = await accountingPeriodsAPI.list();
      if (err) throw err;
      setPeriods((data as PeriodRow[]) || []);
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
        <h2 className="text-2xl font-bold text-slate-900">Fechamentos Mensais</h2>
        <p className="text-slate-600">
          Feche períodos para bloquear alterações em apontamentos. Períodos fechados impedem
          criação, edição e exclusão de apontamentos por profissionais não-administradores.
        </p>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-4">
          <p className="text-sm font-medium text-red-800">{error}</p>
        </div>
      )}
      {actionError && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-4">
          <p className="text-sm font-medium text-red-800">{actionError}</p>
        </div>
      )}

      {periods.length === 0 ? (
        <div className="rounded-xl border border-slate-200 p-12 text-center bg-slate-50">
          <p className="text-slate-600">Nenhum período de fechamento registrado</p>
          <p className="text-sm text-slate-500 mt-2">
            Períodos são criados automaticamente quando há apontamentos. Feche um período
            para bloquear alterações.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 shadow-sm">
          <table className="w-full">
            <thead className="bg-slate-100 border-b border-slate-200">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-semibold text-slate-900">Período</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-slate-900">Status</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-slate-900">Fechado por</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-slate-900">Fechado em</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-slate-900">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {periods.map((p) => (
                <tr key={p.id} className="hover:bg-slate-50 transition">
                  <td className="px-4 py-3 text-sm text-slate-900 font-medium">{p.period_key}</td>
                  <td className="px-4 py-3 text-sm">
                    <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-semibold ${p.status === 'closed' ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'}`}>
                      {p.status === 'closed' ? 'Fechado' : 'Aberto'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-700">
                    {p.closed_by_profile?.full_name || '—'}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-700">{formatDateTime(p.closed_at)}</td>
                  <td className="px-4 py-3 text-sm">
                    {p.status === 'open' ? (
                      <button
                        onClick={() => setCloseTarget(p)}
                        disabled={busy}
                        className="px-2.5 py-1 rounded-md text-xs font-medium border border-red-300 text-red-700 hover:bg-red-50 transition disabled:opacity-50"
                      >
                        Fechar período
                      </button>
                    ) : (
                      <button
                        onClick={() => setReopenTarget(p)}
                        disabled={busy}
                        className="px-2.5 py-1 rounded-md text-xs font-medium border border-slate-300 text-slate-700 hover:bg-slate-100 transition disabled:opacity-50"
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
    </div>
  );
}
