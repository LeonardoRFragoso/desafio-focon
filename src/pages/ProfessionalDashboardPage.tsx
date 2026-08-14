import { Layout } from '@/components/Layout';
import { ProfessionalDashboard } from '@/features/professional/ProfessionalDashboard';

export function ProfessionalDashboardPage() {
  return (
    <Layout>
      <div className="space-y-8">
        <div className="border-b border-slate-200 pb-6">
          <h1 className="text-4xl font-bold text-slate-900">Meu Painel</h1>
          <p className="mt-2 text-lg text-slate-600">
            Acompanhe seus apontamentos e horas trabalhadas
          </p>
        </div>

        <ProfessionalDashboard />
      </div>
    </Layout>
  );
}
