import { useNavigate } from 'react-router-dom';
import type { ProfessionalDashboardStats } from '@/lib/supabase/api';

interface MyTasksProps {
  stats: ProfessionalDashboardStats | null;
  loading: boolean;
}

const PRIORITY_STYLES = {
  critical: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  high: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300',
  medium: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  low: 'bg-slate-100 text-slate-600 bg-surface-secondary text-app-secondary',
} as const;

type PriorityKey = keyof typeof PRIORITY_STYLES;

const STATUS_LABELS: Record<string, string> = {
  todo: 'A Fazer',
  in_progress: 'Em Andamento',
  blocked: 'Bloqueada',
  done: 'Concluída',
  cancelled: 'Cancelada',
};

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—';
  const date = new Date(dateStr + 'T00:00:00');
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

function isOverdue(dateStr: string | null): boolean {
  if (!dateStr) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(dateStr + 'T00:00:00');
  return due < today;
}

export function MyTasks({ stats, loading }: MyTasksProps) {
  const navigate = useNavigate();

  if (loading || !stats) {
    return (
      <section aria-label="Minhas Tarefas" className="space-y-4">
        <h2 className="text-2xl font-semibold text-app-primary">Minhas Tarefas</h2>
        <div className="h-48 rounded-xl border border-app-primary bg-surface-secondary animate-pulse" />
      </section>
    );
  }

  const tasks = stats.my_tasks;

  if (tasks.length === 0) {
    return (
      <section aria-label="Minhas Tarefas" className="space-y-4">
        <h2 className="text-2xl font-semibold text-app-primary">Minhas Tarefas</h2>
        <div className="rounded-xl border border-app-primary bg-surface-primary p-6 text-center">
          <p className="text-sm text-app-muted">
            Nenhuma tarefa atribuída a você no momento
          </p>
        </div>
      </section>
    );
  }

  return (
    <section aria-label="Minhas Tarefas" className="space-y-4">
      <h2 className="text-2xl font-semibold text-app-primary">Minhas Tarefas</h2>

      {/* Desktop table */}
      <div className="hidden md:block overflow-x-auto rounded-xl border border-app-primary bg-surface-primary">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-app-primary text-left text-xs text-app-muted uppercase tracking-wide">
              <th className="px-4 py-3 font-medium">Projeto</th>
              <th className="px-4 py-3 font-medium">Tarefa</th>
              <th className="px-4 py-3 font-medium">Fase</th>
              <th className="px-4 py-3 font-medium">Prioridade</th>
              <th className="px-4 py-3 font-medium">Prazo</th>
              <th className="px-4 py-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {tasks.map(task => {
              const overdue = isOverdue(task.due_date);
              return (
                <tr
                  key={task.id}
                  onClick={() => navigate(`/projects/${task.project_id}?tab=tasks&task=${task.id}`)}
                  className="border-b border-app-primary cursor-pointer hover:bg-hover-surface/50 transition"
                >
                  <td className="px-4 py-3 text-app-muted truncate max-w-32">{task.project_name}</td>
                  <td className="px-4 py-3 font-medium text-app-primary truncate max-w-48">{task.title}</td>
                  <td className="px-4 py-3 text-app-muted truncate max-w-32">{task.phase_name ?? '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-block px-2 py-0.5 text-xs font-medium rounded capitalize ${(task.priority in PRIORITY_STYLES ? PRIORITY_STYLES[task.priority as PriorityKey] : PRIORITY_STYLES.low)}`}>
                      {task.priority}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={overdue ? 'text-red-600 dark:text-red-400 font-medium' : 'text-app-muted'}>
                      {formatDate(task.due_date)}
                      {overdue && ' ⚠'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-app-muted">{STATUS_LABELS[task.status] ?? task.status}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden space-y-3">
        {tasks.map(task => {
          const overdue = isOverdue(task.due_date);
          return (
            <div
              key={task.id}
              onClick={() => navigate(`/projects/${task.project_id}?tab=tasks&task=${task.id}`)}
              className="rounded-xl border border-app-primary bg-surface-primary p-4 cursor-pointer active:bg-slate-50 dark:active:bg-slate-800/50 transition"
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                <p className="font-medium text-app-primary truncate flex-1">{task.title}</p>
                <span className={`inline-block px-2 py-0.5 text-xs font-medium rounded capitalize shrink-0 ${(task.priority in PRIORITY_STYLES ? PRIORITY_STYLES[task.priority as PriorityKey] : PRIORITY_STYLES.low)}`}>
                  {task.priority}
                </span>
              </div>
              <p className="text-xs text-app-muted mb-2">{task.project_name}</p>
              <div className="flex items-center justify-between text-xs">
                <span className="text-app-muted">{STATUS_LABELS[task.status] ?? task.status}</span>
                <span className={overdue ? 'text-red-600 dark:text-red-400 font-medium' : 'text-app-muted'}>
                  {formatDate(task.due_date)}{overdue && ' ⚠'}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
