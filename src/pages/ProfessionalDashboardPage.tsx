import { ProfessionalDashboard } from '@/features/professional/ProfessionalDashboard';

export function ProfessionalDashboardPage() {
  return (
    <div className="space-y-8">
      <div className="border-b border-slate-200 dark:border-slate-700 pb-6">
        <h1 className="text-4xl font-bold text-slate-900 dark:text-slate-100">Meu Painel</h1>
        <p className="mt-2 text-lg text-slate-600 dark:text-slate-400">
          Acompanhe seus apontamentos e horas trabalhadas
        </p>
      </div>

      <ProfessionalDashboard />
    </div>
  );
}
