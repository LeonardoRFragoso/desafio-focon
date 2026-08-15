import type { AdminCommandCenterSummary } from '@/lib/supabase/api';

interface FinancialOverviewProps {
  summary: AdminCommandCenterSummary | null;
  loading: boolean;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

export function FinancialOverview({ summary, loading }: FinancialOverviewProps) {
  if (loading || !summary) {
    return (
      <section aria-label="Visão Financeira" className="space-y-4">
        <h2 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Visão Financeira</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="h-28 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 animate-pulse" />
          ))}
        </div>
      </section>
    );
  }

  const k = summary.kpis;
  const marginColor = k.total_margin >= 20
    ? 'text-green-600 dark:text-green-400'
    : k.total_margin >= 0
    ? 'text-amber-600 dark:text-amber-400'
    : 'text-red-600 dark:text-red-400';

  return (
    <section aria-label="Visão Financeira" className="space-y-4">
      <h2 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Visão Financeira</h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2">Receita</p>
          <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">{formatCurrency(k.total_revenue)}</p>
        </div>
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2">Custo Mão de Obra</p>
          <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">{formatCurrency(k.total_labor_cost)}</p>
        </div>
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2">Resultado</p>
          <p className={`text-2xl font-bold ${k.total_result >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
            {formatCurrency(k.total_result)}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2">Margem</p>
          <p className={`text-2xl font-bold ${marginColor}`}>{k.total_margin.toFixed(1)}%</p>
        </div>
      </div>
      {/* Note: trend comparison vs previous period is intentionally omitted
          because the RPC does not return previous-period data yet.
          Adding fake trend percentages is prohibited by the phase spec. */}
    </section>
  );
}
