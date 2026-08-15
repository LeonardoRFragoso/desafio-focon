import { ProfessionalDashboard } from '@/features/professional/ProfessionalDashboard';

export function ProfessionalDashboardPage() {
  return (
    <div className="space-y-8">
      <div className="border-b border-app-primary pb-6">
        <h1 className="text-4xl font-bold text-app-primary">Meu Painel</h1>
        <p className="mt-2 text-lg text-app-muted">
          Acompanhe seus apontamentos e horas trabalhadas
        </p>
      </div>

      <ProfessionalDashboard />
    </div>
  );
}
