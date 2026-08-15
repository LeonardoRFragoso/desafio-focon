import { useNavigate } from 'react-router-dom';
import type { AdminCommandCenterSummary } from '@/lib/supabase/api';

interface ApprovalQueueSummaryProps {
  summary: AdminCommandCenterSummary | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

export function ApprovalQueueSummary({ summary, loading, error, onRetry }: ApprovalQueueSummaryProps) {
  const navigate = useNavigate();

  if (loading) {
    return (
      <section aria-label="Fila de Aprovações" className="space-y-4">
        <div className="h-6 w-48 bg-slate-100 dark:bg-slate-800 rounded animate-pulse" />
        <div className="h-32 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 animate-pulse" />
      </section>
    );
  }

  if (error || !summary) {
    return (
      <section aria-label="Fila de Aprovações" className="space-y-4">
        <h2 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Fila de Aprovações</h2>
        <div className="rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-red-800 dark:text-red-400">Dados indisponíveis</p>
            <button
              onClick={onRetry}
              className="ml-4 px-3 py-1.5 text-sm font-medium text-red-700 dark:text-red-300 bg-red-100 dark:bg-red-900/40 hover:bg-red-200 dark:hover:bg-red-900/60 rounded transition"
            >
              Tentar novamente
            </button>
          </div>
        </div>
      </section>
    );
  }

  const pendingCount = summary.kpis.pending_approvals;
  const queue = summary.pending_approvals;

  if (pendingCount === 0) {
    return (
      <section aria-label="Fila de Aprovações" className="space-y-4">
        <h2 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Fila de Aprovações</h2>
        <div className="rounded-xl border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20 p-4">
          <div className="flex items-center gap-3">
            <span className="text-xl">✓</span>
            <p className="text-sm font-medium text-green-800 dark:text-green-300">
              Nenhum apontamento pendente
            </p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section aria-label="Fila de Aprovações" className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">
          Fila de Aprovações
        </h2>
        <button
          onClick={() => navigate('/admin/time-entries?status=pending')}
          className="text-sm font-medium text-focon-600 dark:text-focon-400 hover:text-focon-700 dark:hover:text-focon-300 transition"
        >
          Ver todos →
        </button>
      </div>

      <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700 bg-amber-50 dark:bg-amber-900/20">
          <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
            {pendingCount} aguardando aprovação
          </p>
        </div>

        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
          {queue.map(entry => (
            <li key={entry.id} className="px-4 py-3 flex items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                  {entry.professional_name} — {entry.project_name}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                  {formatDate(entry.entry_date)} · {entry.duration_minutes}min · {entry.description}
                </p>
              </div>
              <button
                onClick={() => navigate(`/admin/time-entries?entry=${entry.id}`)}
                className="text-xs font-medium text-focon-600 dark:text-focon-400 hover:text-focon-700 dark:hover:text-focon-300 transition shrink-0"
              >
                Revisar
              </button>
            </li>
          ))}
        </ul>

        {pendingCount > queue.length && (
          <div className="px-4 py-2 border-t border-slate-200 dark:border-slate-700 text-center">
            <button
              onClick={() => navigate('/admin/time-entries?status=pending')}
              className="text-xs text-slate-500 dark:text-slate-400 hover:text-focon-600 dark:hover:text-focon-400 transition"
            >
              +{pendingCount - queue.length} mais antigos
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
