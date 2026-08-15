import type { AdminCommandCenterSummary } from '@/lib/supabase/api';

interface TeamOverviewProps {
  summary: AdminCommandCenterSummary | null;
  loading: boolean;
}

function formatHours(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (m === 0) return `${h}h`;
  return `${h}h${m.toString().padStart(2, '0')}`;
}

export function TeamOverview({ summary, loading }: TeamOverviewProps) {
  if (loading || !summary) {
    return (
      <section aria-label="Equipe" className="space-y-4">
        <h2 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Equipe</h2>
        <div className="h-32 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 animate-pulse" />
      </section>
    );
  }

  const team = summary.team_summary;

  if (team.length === 0) {
    return (
      <section aria-label="Equipe" className="space-y-4">
        <h2 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Equipe</h2>
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-6 text-center">
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Nenhuma hora aprovada no período selecionado
          </p>
        </div>
      </section>
    );
  }

  const maxHours = Math.max(...team.map(t => t.approved_hours), 1);

  return (
    <section aria-label="Equipe" className="space-y-4">
      <h2 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Equipe</h2>
      <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 overflow-hidden">
        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
          {team.map((member, idx) => (
            <li key={member.professional_id} className="px-4 py-3 flex items-center gap-4">
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <span className="text-sm text-slate-400 shrink-0 w-6">#{idx + 1}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                    {member.full_name}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {member.entry_count} apontamento(s)
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <div className="hidden sm:block w-32 bg-slate-100 dark:bg-slate-800 rounded-full h-2 overflow-hidden">
                  <div
                    className="bg-focon-600 h-full rounded-full transition-all"
                    style={{ width: `${(member.approved_hours / maxHours) * 100}%` }}
                    aria-hidden="true"
                  />
                </div>
                <span className="text-sm font-medium text-slate-700 dark:text-slate-200 w-16 text-right">
                  {formatHours(member.approved_hours)}
                </span>
              </div>
            </li>
          ))}
        </ul>
      </div>
      <p className="text-xs text-slate-400 dark:text-slate-500">
        Horas aprovadas por profissional no período selecionado. Capacidade e utilização serão implementadas na Fase 4.
      </p>
    </section>
  );
}
