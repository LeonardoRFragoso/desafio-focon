import { useState } from 'react';
import { Layout } from '@/components/Layout';
import { TimeEntryForm } from '@/features/time-entries/TimeEntryForm';
import { TimeEntryList } from '@/features/time-entries/TimeEntryList';

export function TimeEntriesPage() {
  const [refreshKey, setRefreshKey] = useState(0);

  const handleFormSuccess = () => {
    setRefreshKey((prev) => prev + 1);
  };

  return (
    <Layout>
      <div className="max-w-6xl mx-auto space-y-8">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Meus Apontamentos</h1>
          <p className="mt-2 text-slate-600">
            Registre suas horas de trabalho por projeto
          </p>
        </div>

        <div className="bg-white rounded-lg border border-slate-200 p-6">
          <h2 className="text-xl font-semibold text-slate-900 mb-6">
            Novo Apontamento
          </h2>
          <TimeEntryForm onSuccess={handleFormSuccess} />
        </div>

        <div className="bg-white rounded-lg border border-slate-200 p-6">
          <h2 className="text-xl font-semibold text-slate-900 mb-6">
            Histórico de Apontamentos
          </h2>
          <TimeEntryList key={refreshKey} />
        </div>
      </div>
    </Layout>
  );
}
