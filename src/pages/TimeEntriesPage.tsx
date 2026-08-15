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
      <div className="border-b border-slate-200 dark:border-slate-700 pb-6 flex justify-between items-start">
        <div>
          <h1 className="text-4xl font-bold text-slate-900 dark:text-slate-100">Meus Apontamentos</h1>
          <p className="mt-2 text-lg text-slate-600 dark:text-slate-400">
            Registre suas horas de trabalho por projeto
          </p>
        </div>
        <PersonalExportButton />
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 p-6 shadow-sm">
        <h2 className="text-2xl font-semibold text-slate-900 dark:text-slate-100 mb-6">
          Novo Apontamento
        </h2>
        <TimeEntryForm onSuccess={handleFormSuccess} />
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 p-6 shadow-sm">
        <h2 className="text-2xl font-semibold text-slate-900 dark:text-slate-100 mb-6">
          Histórico de Apontamentos
        </h2>
        <TimeEntryList key={refreshKey} />
      </div>
    </div>
  );
}
