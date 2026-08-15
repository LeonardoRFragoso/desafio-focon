interface ProfessionalData {
  professional_id: string;
  professional_name: string;
  total_hours: number;
  hourly_rates: number[];
  total_cost: number;
}

interface ProfessionalSummaryProps {
  data: ProfessionalData[];
  loading?: boolean;
}

export function ProfessionalSummary({
  data,
  loading = false,
}: ProfessionalSummaryProps) {
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
  };

  const formatHours = (minutes: number) => {
    const hours = minutes / 60;
    return `${hours.toFixed(1)}h`;
  };

  if (loading) {
    return (
      <div className="space-y-2">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-12 bg-slate-200 dark:bg-slate-700 rounded"></div>
        ))}
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-8 text-center bg-slate-50 dark:bg-slate-800/50">
        <p className="text-slate-600 dark:text-slate-400">Nenhum dado para exibir</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
      <table className="w-full">
        <thead>
          <tr className="border-b border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800">
            <th className="px-6 py-4 text-left text-sm font-semibold text-slate-900 dark:text-slate-100">
              Profissional
            </th>
            <th className="px-6 py-4 text-left text-sm font-semibold text-slate-900 dark:text-slate-100">
              Total de Horas
            </th>
            <th className="px-6 py-4 text-left text-sm font-semibold text-slate-900 dark:text-slate-100">
              Custo-hora
            </th>
            <th className="px-6 py-4 text-right text-sm font-semibold text-slate-900 dark:text-slate-100">
              Custo Total
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
          {data.map((row) => (
            <tr
              key={row.professional_id}
              className="hover:bg-slate-50 dark:hover:bg-slate-800 transition"
            >
              <td className="px-6 py-4 text-sm font-medium text-slate-900 dark:text-slate-100">
                {row.professional_name}
              </td>
              <td className="px-6 py-4 text-sm text-slate-900 dark:text-slate-100">
                {formatHours(row.total_hours)}
              </td>
              <td className="px-6 py-4 text-sm text-slate-900 dark:text-slate-100">
                {row.hourly_rates.map((rate) => formatCurrency(rate)).join(', ')}
              </td>
              <td className="px-6 py-4 text-sm font-semibold text-slate-900 dark:text-slate-100 text-right">
                {formatCurrency(row.total_cost)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
