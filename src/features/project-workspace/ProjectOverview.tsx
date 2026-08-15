import type { Project, ProjectWorkspaceSummary } from '@/types/database';

interface ProjectOverviewProps {
  project: Project;
  summary: ProjectWorkspaceSummary | null;
  isAdmin: boolean;
}

export function ProjectOverview({ project, summary, isAdmin }: ProjectOverviewProps) {
  const formatDate = (d: string) => new Date(d).toLocaleDateString('pt-BR');
  const formatHours = (minutes: number) => `${(minutes / 60).toFixed(1)}h`;

  const cards: { label: string; value: string; hint?: string }[] = [
    { label: 'Início', value: formatDate(project.start_date) },
    { label: 'Prazo', value: formatDate(project.end_date) },
  ];

  if (summary) {
    cards.push(
      { label: 'Fases', value: String(summary.total_phases), hint: `${summary.active_phases} ativas, ${summary.completed_phases} concluídas` },
      { label: 'Tarefas', value: String(summary.total_tasks), hint: `${summary.open_tasks} abertas, ${summary.done_tasks} concluídas` },
      { label: 'Tarefas atrasadas', value: String(summary.overdue_tasks) },
      { label: 'Equipe', value: String(summary.team_size) },
      { label: 'Horas planejadas', value: formatHours(summary.planned_minutes) },
      { label: 'Horas registradas', value: formatHours(summary.logged_minutes) }
    );
  }

  return (
    <div className="space-y-6">
      {/* Project info */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((card) => (
          <div
            key={card.label}
            className="rounded-xl border border-app-primary bg-surface-primary p-4 shadow-sm"
          >
            <p className="text-xs font-medium text-app-muted uppercase tracking-wide">
              {card.label}
            </p>
            <p className="mt-1 text-2xl font-bold text-app-primary">
              {card.value}
            </p>
            {card.hint && (
              <p className="mt-1 text-xs text-app-muted">{card.hint}</p>
            )}
          </div>
        ))}
      </div>

      {/* Project description placeholder */}
      <div className="rounded-xl border border-app-primary bg-surface-primary p-6 shadow-sm">
        <h3 className="text-lg font-semibold text-app-primary mb-3">
          Informações do Projeto
        </h3>
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <dt className="text-sm text-app-muted">Nome</dt>
            <dd className="text-sm font-medium text-app-primary">{project.name}</dd>
          </div>
          <div>
            <dt className="text-sm text-app-muted">Cliente</dt>
            <dd className="text-sm font-medium text-app-primary">{project.client}</dd>
          </div>
          <div>
            <dt className="text-sm text-app-muted">Status</dt>
            <dd className="text-sm font-medium text-app-primary">{project.status}</dd>
          </div>
          <div>
            <dt className="text-sm text-app-muted">Período</dt>
            <dd className="text-sm font-medium text-app-primary">
              {formatDate(project.start_date)} — {formatDate(project.end_date)}
            </dd>
          </div>
        </dl>
      </div>

      {!isAdmin && (
        <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-4">
          <p className="text-sm text-amber-800 dark:text-amber-400">
            Informações financeiras estão disponíveis apenas para administradores.
          </p>
        </div>
      )}
    </div>
  );
}
