import { useMemo } from 'react';

interface ExecutiveKpisProps {
  kpis: {
    total_revenue: number;
    total_labor_cost: number;
    total_result: number;
    total_margin: number;
    approved_hours_period: number;
    active_projects: number;
    pending_approvals: number;
    open_tasks: number;
    overdue_tasks: number;
  };
  loading?: boolean;
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
  loading,
}: {
  label: string;
  value: string;
  sublabel?: string | undefined;
  icon: string;
  accent?: string | undefined;
  loading?: boolean | undefined;
}) {
  if (loading) {
    return (
      <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4">
        <div className="h-4 w-20 bg-slate-100 dark:bg-slate-800 rounded animate-pulse mb-2" />
        <div className="h-8 w-28 bg-slate-100 dark:bg-slate-800 rounded animate-pulse" />
      </div>
    );
  }

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

export function ExecutiveKpis({ kpis, loading }: ExecutiveKpisProps) {
  const marginColor = useMemo(() => {
    if (kpis.total_margin >= 20) return 'text-green-600 dark:text-green-400';
    if (kpis.total_margin >= 0) return 'text-amber-600 dark:text-amber-400';
    return 'text-red-600 dark:text-red-400';
  }, [kpis.total_margin]);

  return (
    <section aria-label="Visão Executiva" className="space-y-4">
      <h2 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Visão Executiva</h2>
      <div className="grid gap-3 grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
        <KpiCard label="Receita Contratada" value={formatCurrency(kpis.total_revenue)} icon="💰" loading={loading} />
        <KpiCard label="Custo de Mão de Obra" value={formatCurrency(kpis.total_labor_cost)} icon="👷" loading={loading} />
        <KpiCard label="Resultado" value={formatCurrency(kpis.total_result)} icon="📈" accent={kpis.total_result >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'} loading={loading} />
        <KpiCard label="Margem" value={`${kpis.total_margin.toFixed(1)}%`} icon="📊" accent={marginColor} loading={loading} />
        <KpiCard label="Horas Aprovadas" value={formatHours(kpis.approved_hours_period)} icon="⏱️" loading={loading} />
        <KpiCard label="Projetos Ativos" value={String(kpis.active_projects)} icon="🏗️" loading={loading} />
        <KpiCard label="Aprovações Pendentes" value={String(kpis.pending_approvals)} icon="⏳" accent={kpis.pending_approvals > 0 ? 'text-amber-600 dark:text-amber-400' : undefined} loading={loading} />
        <KpiCard label="Tarefas Abertas" value={String(kpis.open_tasks)} icon="📋" loading={loading} />
        <KpiCard label="Tarefas Atrasadas" value={String(kpis.overdue_tasks)} icon="📅" accent={kpis.overdue_tasks > 0 ? 'text-red-600 dark:text-red-400' : undefined} loading={loading} />
      </div>
    </section>
  );
}
