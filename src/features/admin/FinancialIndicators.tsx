interface FinancialIndicatorsProps {
  revenue: number;
  laborCost: number;
  result: number;
  margin: number;
  loading?: boolean;
}

export function FinancialIndicators({
  revenue,
  laborCost,
  result,
  margin,
  loading = false,
}: FinancialIndicatorsProps) {
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
  };

  const formatPercentage = (value: number) => {
    return `${value.toFixed(2)}%`;
  };

  const indicators = [
    {
      label: 'Receita',
      value: revenue,
      format: formatCurrency,
      color: 'bg-white dark:bg-slate-900 border-focon-200 dark:border-focon-800',
      textColor: 'text-focon-700 dark:text-focon-300',
    },
    {
      label: 'Custo de Mão de Obra',
      value: laborCost,
      format: formatCurrency,
      color: 'bg-white dark:bg-slate-900 border-focon-200 dark:border-focon-800',
      textColor: 'text-slate-900 dark:text-slate-100',
    },
    {
      label: 'Resultado',
      value: result,
      format: formatCurrency,
      color: 'bg-white dark:bg-slate-900 border-green-200 dark:border-green-800',
      textColor: 'text-green-700 dark:text-green-400',
    },
    {
      label: 'Margem',
      value: margin,
      format: formatPercentage,
      color: 'bg-white dark:bg-slate-900 border-focon-200 dark:border-focon-800',
      textColor: 'text-focon-700 dark:text-focon-300',
    },
  ];

  if (loading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-6">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 p-6 shadow-sm">
            <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-24 mb-4"></div>
            <div className="h-8 bg-slate-200 dark:bg-slate-700 rounded w-32"></div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-6">
      {indicators.map((indicator) => (
        <div
          key={indicator.label}
          className={`rounded-xl border ${indicator.color} p-6 shadow-sm`}
        >
          <p className="text-sm font-medium text-slate-600 dark:text-slate-400 mb-3">
            {indicator.label}
          </p>
          <p className={`text-3xl font-bold ${indicator.textColor}`}>
            {indicator.format(indicator.value)}
          </p>
        </div>
      ))}
    </div>
  );
}
