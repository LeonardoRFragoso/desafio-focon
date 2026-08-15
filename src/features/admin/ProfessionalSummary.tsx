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
          <div key={i} className="h-12 bg-surface-elevated rounded"></div>
        ))}
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="rounded-xl border border-app-primary p-8 text-center bg-surface-secondary/50">
        <p className="text-app-muted">Nenhum dado para exibir</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-app-primary shadow-sm">
      <table className="w-full">
        <thead>
          <tr className="border-b border-app-primary bg-surface-secondary">
            <th className="px-6 py-4 text-left text-sm font-semibold text-app-primary">
              Profissional
            </th>
            <th className="px-6 py-4 text-left text-sm font-semibold text-app-primary">
              Total de Horas
            </th>
            <th className="px-6 py-4 text-left text-sm font-semibold text-app-primary">
              Custo-hora
            </th>
            <th className="px-6 py-4 text-right text-sm font-semibold text-app-primary">
              Custo Total
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-table-divider">
          {data.map((row) => (
            <tr
              key={row.professional_id}
              className="hover:bg-hover-surface transition"
            >
              <td className="px-6 py-4 text-sm font-medium text-app-primary">
                {row.professional_name}
              </td>
              <td className="px-6 py-4 text-sm text-app-primary">
                {formatHours(row.total_hours)}
              </td>
              <td className="px-6 py-4 text-sm text-app-primary">
                {row.hourly_rates.map((rate) => formatCurrency(rate)).join(', ')}
              </td>
              <td className="px-6 py-4 text-sm font-semibold text-app-primary text-right">
                {formatCurrency(row.total_cost)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
