import { useState } from 'react';
import { useAuthContext } from '@/features/auth/useAuthContext';
import { timeEntriesAPI } from '@/lib/supabase/api';
import { exportPersonalEntriesCSV } from '@/lib/export';
import type { TimeEntryWithRelations } from '@/types/database';

/**
 * Button that exports the current user's time entries to CSV.
 * Includes rejection reasons in the export.
 */
export function PersonalExportButton() {
  const { user, profile } = useAuthContext();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleExport = async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const { data, error: err } = await timeEntriesAPI.getByUser(user.id);
      if (err) throw err;
      const entries = (data as TimeEntryWithRelations[]) || [];
      if (entries.length === 0) {
        setError('Nenhum apontamento para exportar.');
        return;
      }
      exportPersonalEntriesCSV(entries, profile?.full_name || 'profissional');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao exportar');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={handleExport}
        disabled={loading}
        className="px-4 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 rounded-lg font-medium transition text-sm disabled:opacity-50"
      >
        {loading ? 'Exportando...' : 'Exportar CSV'}
      </button>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
