import { useNavigate } from 'react-router-dom';
import type { AdminCommandCenterSummary } from '@/lib/supabase/api';

interface AdminActionCenterProps {
  summary: AdminCommandCenterSummary | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  overloadedProfessionalsCount?: number;
}

type Severity = 'info' | 'warning' | 'critical' | 'success';

interface ActionSignal {
  id: string;
  severity: Severity;
  icon: string;
  title: string;
  description: string;
  ctaLabel: string;
  ctaHref: string;
}

const SEVERITY_STYLES: Record<Severity, string> = {
  info: 'border-blue-200 border-app-strong bg-blue-50 bg-surface-primary/20',
  warning: 'border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20',
  critical: 'border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20',
  success: 'border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20',
};

const SEVERITY_BADGE: Record<Severity, string> = {
  info: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  warning: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  critical: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  success: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
};

const SEVERITY_LABEL: Record<Severity, string> = {
  info: 'INFO',
  warning: 'ATENÇÃO',
  critical: 'CRÍTICO',
  success: 'OK',
};

export function AdminActionCenter({ summary, loading, error, onRetry, overloadedProfessionalsCount = 0 }: AdminActionCenterProps) {
  const navigate = useNavigate();

  if (loading) {
    return (
      <section aria-label="Central de Ações" className="space-y-4">
        <h2 className="text-2xl font-semibold text-app-primary">
          O que precisa da minha atenção?
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map(i => (
            <div
              key={i}
              className="h-32 rounded-xl border border-app-primary bg-surface-secondary animate-pulse"
            />
          ))}
        </div>
      </section>
    );
  }

  if (error) {
    return (
      <section aria-label="Central de Ações" className="space-y-4">
        <h2 className="text-2xl font-semibold text-app-primary">
          O que precisa da minha atenção?
        </h2>
        <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-4">
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

  if (!summary) return null;

  const signals = summary.action_signals;
  const items: ActionSignal[] = [];

  if (signals.pending_count > 0) {
    items.push({
      id: 'pending',
      severity: signals.old_pending_count > 0 ? 'critical' : 'warning',
      icon: '⏳',
      title: `${signals.pending_count} apontamento(s) aguardando aprovação`,
      description: signals.old_pending_count > 0
        ? `${signals.old_pending_count} aguardam há mais de ${signals.old_pending_threshold_days} dias`
        : 'Revisar apontamentos pendentes',
      ctaLabel: 'Revisar agora',
      ctaHref: '/admin/time-entries?status=pending',
    });
  }

  if (signals.rejected_recent_count > 0) {
    items.push({
      id: 'rejected-recent',
      severity: 'info',
      icon: '❌',
      title: `${signals.rejected_recent_count} apontamento(s) rejeitado(s) nos últimos 7 dias`,
      description: 'Profissionais podem precisar corrigir e reenviar',
      ctaLabel: 'Ver histórico',
      ctaHref: '/admin/time-entries?status=rejected',
    });
  }

  signals.overbudget_projects.forEach(p => {
    const util = p.utilization_percent;
    items.push({
      id: `overbudget-${p.project_id}`,
      severity: util >= 100 ? 'critical' : 'warning',
      icon: '💰',
      title: `${p.project_name} — ${util}% do orçamento utilizado`,
      description: `Cliente: ${p.client}`,
      ctaLabel: 'Abrir projeto',
      ctaHref: `/projects/${p.project_id}`,
    });
  });

  if (signals.unack_alerts_count > 0) {
    items.push({
      id: 'alerts',
      severity: 'warning',
      icon: '🚨',
      title: `${signals.unack_alerts_count} alerta(s) de rentabilidade não reconhecido(s)`,
      description: 'Revise os alertas de rentabilidade ativos',
      ctaLabel: 'Ver alertas',
      ctaHref: '/admin/alerts',
    });
  }

  if (signals.overdue_tasks_count > 0) {
    items.push({
      id: 'overdue-tasks',
      severity: 'warning',
      icon: '📅',
      title: `${signals.overdue_tasks_count} tarefa(s) atrasada(s)`,
      description: 'Tarefas com prazo vencido e não concluídas',
      ctaLabel: 'Ver projetos',
      ctaHref: '/admin/projects',
    });
  }

  if (signals.critical_tasks_count > 0) {
    items.push({
      id: 'critical-tasks',
      severity: 'critical',
      icon: '🔥',
      title: `${signals.critical_tasks_count} tarefa(s) crítica(s) em aberto`,
      description: 'Tarefas de prioridade crítica não concluídas',
      ctaLabel: 'Ver projetos',
      ctaHref: '/admin/projects',
    });
  }

  if (signals.missing_rate_count > 0) {
    items.push({
      id: 'missing-rates',
      severity: 'warning',
      icon: '💵',
      title: `${signals.missing_rate_count} profissional(is) sem valor/hora vigente`,
      description: 'Profissionais ativos sem taxa válida para a data atual',
      ctaLabel: 'Configurar taxas',
      ctaHref: '/admin/hourly-rates',
    });
  }

  if (signals.projects_without_team_count > 0) {
    items.push({
      id: 'no-team',
      severity: 'warning',
      icon: '👥',
      title: `${signals.projects_without_team_count} projeto(s) ativo(s) sem equipe alocada`,
      description: 'Projetos ativos sem membros da equipe',
      ctaLabel: 'Ver projetos',
      ctaHref: '/admin/projects',
    });
  }

  if (overloadedProfessionalsCount > 0) {
    items.push({
      id: 'overloaded-capacity',
      severity: 'critical',
      icon: '⚠️',
      title: `${overloadedProfessionalsCount} profissional(is) sobrecarregado(s)`,
      description: 'Profissionais com alocação superior à capacidade semanal',
      ctaLabel: 'Ver capacidade',
      ctaHref: '/admin/capacity',
    });
  }

  return (
    <section aria-label="Central de Ações" className="space-y-4">
      <h2 className="text-2xl font-semibold text-app-primary">
        O que precisa da minha atenção?
      </h2>

      {items.length === 0 ? (
        <div className="rounded-xl border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20 p-6">
          <div className="flex items-center gap-3">
            <span className="text-2xl">✓</span>
            <p className="text-sm font-medium text-green-800 dark:text-green-300">
              Nenhuma pendência crítica no momento
            </p>
          </div>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" role="list">
          {items.map(item => (
            <div
              key={item.id}
              role="listitem"
              className={`rounded-xl border p-4 ${SEVERITY_STYLES[item.severity]}`}
              aria-label={`${SEVERITY_LABEL[item.severity]} — ${item.title}`}
            >
              <div className="flex items-start gap-3">
                <span className="text-2xl shrink-0" aria-hidden="true">{item.icon}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span
                      className={`inline-block px-2 py-0.5 text-xs font-bold rounded ${SEVERITY_BADGE[item.severity]}`}
                      aria-hidden="true"
                    >
                      {SEVERITY_LABEL[item.severity]}
                    </span>
                  </div>
                  <p className="text-sm font-medium text-app-primary">
                    {item.title}
                  </p>
                  <p className="text-xs text-app-muted mt-1">
                    {item.description}
                  </p>
                  <button
                    onClick={() => navigate(item.ctaHref)}
                    className="mt-3 text-sm font-medium text-focon-600 dark:text-focon-400 hover:text-focon-700 dark:hover:text-focon-300 transition"
                  >
                    {item.ctaLabel} →
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
