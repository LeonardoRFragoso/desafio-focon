import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { commandCenterAPI } from '@/lib/supabase/api';
import type { ProjectAttentionItem } from '@/lib/supabase/api';
import { mapDatabaseError } from '@/lib/errors';

const ATTENTION_STYLES = {
  critical: { badge: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300', label: 'CRÍTICO', icon: '🔴' },
  warning: { badge: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300', label: 'ATENÇÃO', icon: '🟡' },
  normal: { badge: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300', label: 'NORMAL', icon: '🟢' },
} as const;

type AttentionState = keyof typeof ATTENTION_STYLES;

function formatHours(minutes: number): string {
  const h = Math.floor(minutes / 60);
  return `${h}h`;
}

export function ProjectsAttention() {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<ProjectAttentionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: rpcError } = await commandCenterAPI.getProjectsAttention();
      if (rpcError) throw new Error(mapDatabaseError(rpcError));
      setProjects((data as unknown as ProjectAttentionItem[]) ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar projetos');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetch();
  }, [fetch]);

  // Separate attention projects from normal
  const attentionProjects = projects.filter(p => p.attention_state !== 'normal');
  const normalCount = projects.length - attentionProjects.length;

  if (loading) {
    return (
      <section aria-label="Projetos que exigem atenção" className="space-y-4">
        <h2 className="text-2xl font-semibold text-app-primary">
          Projetos que exigem atenção
        </h2>
        <div className="h-48 rounded-xl border border-app-primary bg-surface-secondary animate-pulse" />
      </section>
    );
  }

  if (error) {
    return (
      <section aria-label="Projetos que exigem atenção" className="space-y-4">
        <h2 className="text-2xl font-semibold text-app-primary">
          Projetos que exigem atenção
        </h2>
        <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-red-800 dark:text-red-400">{error}</p>
            <button
              onClick={fetch}
              className="ml-4 px-3 py-1.5 text-sm font-medium text-red-700 dark:text-red-300 bg-red-100 dark:bg-red-900/40 hover:bg-red-200 dark:hover:bg-red-900/60 rounded transition"
            >
              Tentar novamente
            </button>
          </div>
        </div>
      </section>
    );
  }

  if (projects.length === 0) {
    return (
      <section aria-label="Projetos que exigem atenção" className="space-y-4">
        <h2 className="text-2xl font-semibold text-app-primary">
          Projetos que exigem atenção
        </h2>
        <div className="rounded-xl border border-app-primary bg-surface-primary p-6 text-center">
          <p className="text-sm text-app-muted">Nenhum projeto cadastrado</p>
        </div>
      </section>
    );
  }

  if (attentionProjects.length === 0) {
    return (
      <section aria-label="Projetos que exigem atenção" className="space-y-4">
        <h2 className="text-2xl font-semibold text-app-primary">
          Projetos que exigem atenção
        </h2>
        <div className="rounded-xl border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20 p-6">
          <div className="flex items-center gap-3">
            <span className="text-2xl">✓</span>
            <p className="text-sm font-medium text-green-800 dark:text-green-300">
              Nenhum projeto requer atenção {normalCount > 0 && `(${normalCount} projeto(s) saudável(is))`}
            </p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section aria-label="Projetos que exigem atenção" className="space-y-4">
      <h2 className="text-2xl font-semibold text-app-primary">
        Projetos que exigem atenção
      </h2>

      {/* Desktop table */}
      <div className="hidden md:block overflow-x-auto rounded-xl border border-app-primary bg-surface-primary">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-app-primary text-left text-xs text-app-muted uppercase tracking-wide">
              <th className="px-4 py-3 font-medium">Projeto</th>
              <th className="px-4 py-3 font-medium">Cliente</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Horas</th>
              <th className="px-4 py-3 font-medium">Budget</th>
              <th className="px-4 py-3 font-medium">Atrasadas</th>
              <th className="px-4 py-3 font-medium">Alertas</th>
              <th className="px-4 py-3 font-medium">Sinal</th>
            </tr>
          </thead>
          <tbody>
            {attentionProjects.map(p => {
              const stateKey = (p.attention_state in ATTENTION_STYLES ? p.attention_state : 'normal') as AttentionState;
              const style = ATTENTION_STYLES[stateKey];
              return (
                <tr
                  key={p.id}
                  onClick={() => navigate(`/projects/${p.id}`)}
                  className="border-b border-app-primary cursor-pointer hover:bg-hover-surface/50 transition"
                >
                  <td className="px-4 py-3 font-medium text-app-primary">{p.name}</td>
                  <td className="px-4 py-3 text-app-muted">{p.client}</td>
                  <td className="px-4 py-3 text-app-muted capitalize">{p.status}</td>
                  <td className="px-4 py-3 text-app-muted">{formatHours(p.approved_minutes)}</td>
                  <td className="px-4 py-3 text-app-muted">
                    {p.budget_value > 0 ? `${p.budget_utilization_percent.toFixed(0)}%` : '—'}
                  </td>
                  <td className="px-4 py-3">
                    {p.overdue_tasks_count > 0 ? (
                      <span className="text-red-600 dark:text-red-400 font-medium">{p.overdue_tasks_count}</span>
                    ) : (
                      <span className="text-slate-400">0</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {p.active_alerts_count > 0 ? (
                      <span className="text-amber-600 dark:text-amber-400 font-medium">{p.active_alerts_count}</span>
                    ) : (
                      <span className="text-slate-400">0</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1 px-2 py-1 text-xs font-bold rounded ${style.badge}`}>
                      {style.icon} {style.label}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden space-y-3">
        {attentionProjects.map(p => {
          const stateKey = (p.attention_state in ATTENTION_STYLES ? p.attention_state : 'normal') as AttentionState;
          const style = ATTENTION_STYLES[stateKey];
          return (
            <div
              key={p.id}
              onClick={() => navigate(`/projects/${p.id}`)}
              className="rounded-xl border border-app-primary bg-surface-primary p-4 cursor-pointer active:bg-slate-50 dark:active:bg-slate-800/50 transition"
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="min-w-0">
                  <p className="font-medium text-app-primary truncate">{p.name}</p>
                  <p className="text-xs text-app-muted truncate">{p.client}</p>
                </div>
                <span className={`inline-flex items-center gap-1 px-2 py-1 text-xs font-bold rounded shrink-0 ${style.badge}`}>
                  {style.icon} {style.label}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2 text-xs text-app-muted">
                <div>
                  <p className="text-slate-400">Horas</p>
                  <p className="font-medium text-app-secondary">{formatHours(p.approved_minutes)}</p>
                </div>
                <div>
                  <p className="text-slate-400">Budget</p>
                  <p className="font-medium text-app-secondary">
                    {p.budget_value > 0 ? `${p.budget_utilization_percent.toFixed(0)}%` : '—'}
                  </p>
                </div>
                <div>
                  <p className="text-slate-400">Atrasadas</p>
                  <p className={`font-medium ${p.overdue_tasks_count > 0 ? 'text-red-600 dark:text-red-400' : 'text-app-secondary'}`}>
                    {p.overdue_tasks_count}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Note: attention_state is NOT the future Project Health Score */}
      <p className="text-xs text-app-muted">
        * attention_state é um indicador operacional temporário derivado de sinais existentes (orçamento, tarefas atrasadas, alertas). Não é o futuro Project Health Score.
      </p>
    </section>
  );
}
