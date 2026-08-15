import type { AdminCommandCenterSummary } from '@/lib/supabase/api';

interface ExecutiveKpisProps {
  kpis: AdminCommandCenterSummary['kpis'] | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

function formatHours(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (mins === 0) return `${hours}h`;
  return `${hours}h${mins.toString().padStart(2, '0')}`;
}

function KpiCard({
  label,
  value,
  sublabel,
  icon,
  accent,
}: {
  label: string;
  value: string;
  sublabel?: string | undefined;
  icon: string;
  accent?: string | undefined;
}) {
  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-lg" aria-hidden="true">{icon}</span>
        <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">{label}</p>
      </div>
      <p className={`text-2xl font-bold ${accent ?? 'text-slate-900 dark:text-slate-100'}`}>{value}</p>
      {sublabel && <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{sublabel}</p>}
    </div>
  );
}

function ErrorCard({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-4 col-span-full">
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
  );
}

export function ExecutiveKpis({ kpis, loading, error, onRetry }: ExecutiveKpisProps) {
  if (loading) {
    return (
      <section aria-label="Visão Executiva" className="space-y-4">
        <h2 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Visão Executiva</h2>
        <div className="grid gap-3 grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
          {[1, 2, 3, 4, 5].map(i => (
            <div key={i} className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4">
              <div className="h-4 w-20 bg-slate-100 dark:bg-slate-800 rounded animate-pulse mb-2" />
              <div className="h-8 w-28 bg-slate-100 dark:bg-slate-800 rounded animate-pulse" />
            </div>
          ))}
        </div>
      </section>
    );
  }

  if (error || !kpis) {
    return (
      <section aria-label="Visão Executiva" className="space-y-4">
        <h2 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Visão Executiva</h2>
        <div className="grid gap-3 grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
          <ErrorCard onRetry={onRetry} />
        </div>
      </section>
    );
  }

  const marginColor = kpis.total_margin >= 20
    ? 'text-green-600 dark:text-green-400'
    : kpis.total_margin >= 0
    ? 'text-amber-600 dark:text-amber-400'
    : 'text-red-600 dark:text-red-400';

  return (
    <section aria-label="Visão Executiva" className="space-y-4">
      <h2 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Visão Executiva</h2>
      <p className="text-xs text-slate-400 dark:text-slate-500">
        Valores contratuais (totais do projeto) — não filtrados por período. Horas e tarefas são operacionais (período selecionado).
      </p>
      <div className="grid gap-3 grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
        <KpiCard label="Receita Contratada" value={formatCurrency(kpis.total_revenue)} icon="💰" sublabel="Total contratual" />
        <KpiCard label="Custo Mão de Obra" value={formatCurrency(kpis.total_labor_cost)} icon="👷" sublabel="Aprovado (total)" />
        <KpiCard label="Impostos" value={formatCurrency(kpis.total_tax)} icon="🏛️" sublabel="Calculado sobre receita" />
        <KpiCard label="Custos Indiretos" value={formatCurrency(kpis.total_indirect_cost)} icon="📦" sublabel="Total contratual" />
        <KpiCard label="Resultado" value={formatCurrency(kpis.total_result)} icon="📈" accent={kpis.total_result >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'} sublabel="Receita - Custos - Tax - Indiretos" />
        <KpiCard label="Margem" value={`${kpis.total_margin.toFixed(1)}%`} icon="📊" accent={marginColor} sublabel="Resultado / Receita" />
        <KpiCard label="Horas Aprovadas" value={formatHours(kpis.approved_hours_period)} icon="⏱️" sublabel="No período" />
        <KpiCard label="Projetos Ativos" value={String(kpis.active_projects)} icon="🏗️" />
        <KpiCard label="Aprovações Pendentes" value={String(kpis.pending_approvals)} icon="⏳" accent={kpis.pending_approvals > 0 ? 'text-amber-600 dark:text-amber-400' : undefined} />
        <KpiCard label="Tarefas Abertas" value={String(kpis.open_tasks)} icon="📋" />
        <KpiCard label="Tarefas Atrasadas" value={String(kpis.overdue_tasks)} icon="📅" accent={kpis.overdue_tasks > 0 ? 'text-red-600 dark:text-red-400' : undefined} />
      </div>
    </section>
  );
}
