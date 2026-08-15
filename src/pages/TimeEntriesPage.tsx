import { useState } from 'react';
import { TimeEntryForm } from '@/features/time-entries/TimeEntryForm';
import { TimeEntryList } from '@/features/time-entries/TimeEntryList';
import { PersonalExportButton } from '@/features/time-entries/PersonalExportButton';

export function TimeEntriesPage() {
  const [refreshKey, setRefreshKey] = useState(0);

  const handleFormSuccess = () => {
    setRefreshKey((prev) => prev + 1);
  };

  return (
    <div className="space-y-8">
      <div className="border-b border-app-primary pb-6 flex justify-between items-start">
        <div>
          <h1 className="text-4xl font-bold text-app-primary">Meus Apontamentos</h1>
          <p className="mt-2 text-lg text-app-muted">
            Registre suas horas de trabalho por projeto
          </p>
        </div>
        <PersonalExportButton />
      </div>

      <div className="bg-surface-primary rounded-xl border border-app-primary p-6 shadow-sm">
        <h2 className="text-2xl font-semibold text-app-primary mb-6">
          Novo Apontamento
        </h2>
        <TimeEntryForm onSuccess={handleFormSuccess} />
      </div>

      <div className="bg-surface-primary rounded-xl border border-app-primary p-6 shadow-sm">
        <h2 className="text-2xl font-semibold text-app-primary mb-6">
          Histórico de Apontamentos
        </h2>
        <TimeEntryList key={refreshKey} />
      </div>
    </div>
  );
}
