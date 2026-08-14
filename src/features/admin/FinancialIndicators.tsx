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
      color: 'bg-white border-focon-200',
      textColor: 'text-focon-900',
    },
    {
      label: 'Custo de Mão de Obra',
      value: laborCost,
      format: formatCurrency,
      color: 'bg-white border-focon-200',
      textColor: 'text-slate-900',
    },
    {
      label: 'Resultado',
      value: result,
      format: formatCurrency,
      color: 'bg-white border-green-200',
      textColor: 'text-green-700',
    },
    {
      label: 'Margem',
      value: margin,
      format: formatPercentage,
      color: 'bg-white border-focon-200',
      textColor: 'text-focon-900',
    },
  ];

  if (loading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-6">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
            <div className="h-4 bg-slate-200 rounded w-24 mb-4"></div>
            <div className="h-8 bg-slate-200 rounded w-32"></div>
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
          <p className="text-sm font-medium text-slate-600 mb-3">
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
