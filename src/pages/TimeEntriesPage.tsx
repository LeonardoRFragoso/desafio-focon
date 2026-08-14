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
      <div className="space-y-8">
        <div className="border-b border-slate-200 pb-6">
          <h1 className="text-4xl font-bold text-slate-900">Meus Apontamentos</h1>
          <p className="mt-2 text-lg text-slate-600">
            Registre suas horas de trabalho por projeto
          </p>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
          <h2 className="text-2xl font-semibold text-slate-900 mb-6">
            Novo Apontamento
          </h2>
          <TimeEntryForm onSuccess={handleFormSuccess} />
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
          <h2 className="text-2xl font-semibold text-slate-900 mb-6">
            Histórico de Apontamentos
          </h2>
          <TimeEntryList key={refreshKey} />
        </div>
      </div>
    </Layout>
  );
}
