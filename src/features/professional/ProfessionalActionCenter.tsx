import { useNavigate } from 'react-router-dom';
import type { ProfessionalDashboardStats } from '@/lib/supabase/api';

interface ProfessionalActionCenterProps {
  stats: ProfessionalDashboardStats | null;
  loading: boolean;
  weeklyGoalMinutes?: number;
}

type Severity = 'info' | 'warning' | 'critical' | 'success';

const SEVERITY_STYLES: Record<Severity, string> = {
  info: 'border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20',
  warning: 'border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20',
  critical: 'border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20',
  success: 'border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20',
};

export function ProfessionalActionCenter({ stats, loading, weeklyGoalMinutes = 2400 }: ProfessionalActionCenterProps) {
  const navigate = useNavigate();

  if (loading || !stats) {
    return (
      <section aria-label="Minhas Pendências" className="space-y-4">
        <h2 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Minhas Pendências</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-28 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 animate-pulse" />
          ))}
        </div>
      </section>
    );
  }

  const items: Array<{ id: string; severity: Severity; icon: string; title: string; description: string; cta?: string; href?: string }> = [];

  // Rejected entries needing correction
  if (stats.stats.rejected_count > 0) {
    items.push({
      id: 'rejected',
      severity: 'critical',
      icon: '❌',
      title: `${stats.stats.rejected_count} apontamento(s) rejeitado(s)`,
      description: 'Corrija e reenvie os apontamentos rejeitados',
      cta: 'Ver rejeitados',
      href: '/time-entries?status=rejected',
    });
  }

  // Overdue tasks
  if (stats.task_counts.overdue > 0) {
    items.push({
      id: 'overdue-tasks',
      severity: 'critical',
      icon: '📅',
      title: `${stats.task_counts.overdue} tarefa(s) atrasada(s)`,
      description: 'Tarefas atribuídas a você com prazo vencido',
      cta: 'Ver tarefas',
      href: '/my-dashboard',
    });
  }

  // Critical tasks
  if (stats.task_counts.critical > 0) {
    items.push({
      id: 'critical-tasks',
      severity: 'warning',
      icon: '🔥',
      title: `${stats.task_counts.critical} tarefa(s) crítica(s)`,
      description: 'Tarefas de alta prioridade em aberto',
    });
  }

  // Due soon tasks
  if (stats.task_counts.due_soon > 0) {
    items.push({
      id: 'due-soon',
      severity: 'info',
      icon: '⏰',
      title: `${stats.task_counts.due_soon} tarefa(s) vencendo em 7 dias`,
      description: 'Prazos se aproximando',
    });
  }

  // Unread notifications
  if (stats.unread_notifications > 0) {
    items.push({
      id: 'notifications',
      severity: 'info',
      icon: '🔔',
      title: `${stats.unread_notifications} notificação(ões) não lida(s)`,
      description: 'Verifique suas notificações',
    });
  }

  // Weekly goal progress
  const approvedMinutes = stats.stats.approved_minutes;
  const goalProgress = Math.min((approvedMinutes / weeklyGoalMinutes) * 100, 100);
  const remainingMinutes = Math.max(weeklyGoalMinutes - approvedMinutes, 0);
  if (remainingMinutes > 0) {
    items.push({
      id: 'weekly-goal',
      severity: 'info',
      icon: '🎯',
      title: `${Math.floor(remainingMinutes / 60)}h restantes para a meta semanal`,
      description: `${goalProgress.toFixed(0)}% concluído (${Math.floor(approvedMinutes / 60)}h de ${Math.floor(weeklyGoalMinutes / 60)}h)`,
    });
  } else {
    items.push({
      id: 'weekly-goal',
      severity: 'success',
      icon: '🎯',
      title: 'Meta semanal atingida',
      description: `Você atingiu ${Math.floor(approvedMinutes / 60)}h de ${Math.floor(weeklyGoalMinutes / 60)}h`,
    });
  }

  return (
    <section aria-label="Minhas Pendências" className="space-y-4">
      <h2 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Minhas Pendências</h2>

      {items.length === 0 ? (
        <div className="rounded-xl border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20 p-6">
          <div className="flex items-center gap-3">
            <span className="text-2xl">✓</span>
            <p className="text-sm font-medium text-green-800 dark:text-green-300">
              Nenhuma pendência no momento
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
            >
              <div className="flex items-start gap-3">
                <span className="text-2xl shrink-0" aria-hidden="true">{item.icon}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                    {item.title}
                  </p>
                  <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                    {item.description}
                  </p>
                  {item.cta && item.href && (
                    <button
                      onClick={() => navigate(item.href!)}
                      className="mt-3 text-sm font-medium text-focon-600 dark:text-focon-400 hover:text-focon-700 dark:hover:text-focon-300 transition"
                    >
                      {item.cta} →
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
