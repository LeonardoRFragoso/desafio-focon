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
      color: 'bg-blue-50 border-blue-200',
      textColor: 'text-blue-900',
    },
    {
      label: 'Custo de Mão de Obra',
      value: laborCost,
      format: formatCurrency,
      color: 'bg-orange-50 border-orange-200',
      textColor: 'text-orange-900',
    },
    {
      label: 'Resultado',
      value: result,
      format: formatCurrency,
      color: 'bg-green-50 border-green-200',
      textColor: 'text-green-900',
    },
    {
      label: 'Margem',
      value: margin,
      format: formatPercentage,
      color: 'bg-purple-50 border-purple-200',
      textColor: 'text-purple-900',
    },
  ];

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="bg-white rounded-lg border border-slate-200 p-6">
            <div className="h-4 bg-slate-200 rounded w-24 mb-4"></div>
            <div className="h-8 bg-slate-200 rounded w-32"></div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      {indicators.map((indicator) => (
        <div
          key={indicator.label}
          className={`rounded-lg border ${indicator.color} p-6`}
        >
          <p className="text-sm font-medium text-slate-600 mb-2">
            {indicator.label}
          </p>
          <p className={`text-2xl font-bold ${indicator.textColor}`}>
            {indicator.format(indicator.value)}
          </p>
        </div>
      ))}
    </div>
  );
}
