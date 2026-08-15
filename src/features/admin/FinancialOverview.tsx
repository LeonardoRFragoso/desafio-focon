import type { AdminCommandCenterSummary } from '@/lib/supabase/api';

interface FinancialOverviewProps {
  summary: AdminCommandCenterSummary | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

export function FinancialOverview({ summary, loading, error, onRetry }: FinancialOverviewProps) {
  if (loading) {
    return (
      <section aria-label="Visão Financeira" className="space-y-4">
        <h2 className="text-2xl font-semibold text-app-primary">Visão Financeira</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="h-28 rounded-xl border border-app-primary bg-surface-secondary animate-pulse" />
          ))}
        </div>
      </section>
    );
  }

  if (error || !summary) {
    return (
      <section aria-label="Visão Financeira" className="space-y-4">
        <h2 className="text-2xl font-semibold text-app-primary">Visão Financeira</h2>
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

  const k = summary.kpis;
  const marginColor = k.total_margin >= 20
    ? 'text-green-600 dark:text-green-400'
    : k.total_margin >= 0
    ? 'text-amber-600 dark:text-amber-400'
    : 'text-red-600 dark:text-red-400';

  return (
    <section aria-label="Visão Financeira" className="space-y-4">
      <h2 className="text-2xl font-semibold text-app-primary">Visão Financeira</h2>
      <p className="text-xs text-app-muted">
        Valores contratuais (totais do projeto). Fórmula: Resultado = Receita - Mão de Obra - Impostos - Custos Indiretos.
      </p>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-app-primary bg-surface-primary p-5">
          <p className="text-xs font-medium text-app-muted uppercase tracking-wide mb-2">Receita Contratada</p>
          <p className="text-2xl font-bold text-app-primary">{formatCurrency(k.total_revenue)}</p>
        </div>
        <div className="rounded-xl border border-app-primary bg-surface-primary p-5">
          <p className="text-xs font-medium text-app-muted uppercase tracking-wide mb-2">Custo Mão de Obra</p>
          <p className="text-2xl font-bold text-app-primary">{formatCurrency(k.total_labor_cost)}</p>
        </div>
        <div className="rounded-xl border border-app-primary bg-surface-primary p-5">
          <p className="text-xs font-medium text-app-muted uppercase tracking-wide mb-2">Impostos + Indiretos</p>
          <p className="text-2xl font-bold text-app-primary">{formatCurrency(k.total_tax + k.total_indirect_cost)}</p>
        </div>
        <div className="rounded-xl border border-app-primary bg-surface-primary p-5">
          <p className="text-xs font-medium text-app-muted uppercase tracking-wide mb-2">Resultado</p>
          <p className={`text-2xl font-bold ${k.total_result >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
            {formatCurrency(k.total_result)}
          </p>
        </div>
      </div>
      <div className="rounded-xl border border-app-primary bg-surface-primary p-5">
        <p className="text-xs font-medium text-app-muted uppercase tracking-wide mb-2">Margem</p>
        <p className={`text-3xl font-bold ${marginColor}`}>{k.total_margin.toFixed(1)}%</p>
      </div>
    </section>
  );
}
