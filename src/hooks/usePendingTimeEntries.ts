import { useState, useCallback, useEffect } from 'react';
import { timeEntriesAPI } from '@/lib/supabase/api';
import { mapDatabaseError, logError } from '@/lib/errors';
import type { TimeEntryWithRelations } from '@/types/database';

interface UsePendingTimeEntriesReturn {
  entries: TimeEntryWithRelations[];
  loading: boolean;
  error: string | null;
  actionLoading: string | null;
  successMessage: string | null;
  approve: (entryId: string) => Promise<void>;
  reject: (entryId: string) => Promise<void>;
  refetch: () => Promise<void>;
}

/**
 * Custom hook for managing pending time entries
 */
export function usePendingTimeEntries(): UsePendingTimeEntriesReturn {
  const [entries, setEntries] = useState<TimeEntryWithRelations[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const fetchPendingEntries = useCallback(async () => {
    try {
      setError(null);
      setLoading(true);

      const { data, error: err } = await timeEntriesAPI.getPending();
      if (err) throw err;

      setEntries((data as TimeEntryWithRelations[]) || []);
    } catch (err) {
      const message = err instanceof Error ? mapDatabaseError(err) : 'Erro ao carregar apontamentos';
      setError(message);
      logError(err, 'usePendingTimeEntries.fetchPendingEntries');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchPendingEntries();
  }, [fetchPendingEntries]);

  const approve = useCallback(
    async (entryId: string) => {
      try {
        setActionLoading(entryId);
        setSuccessMessage(null);
        setError(null);

        const { data, error: err } = await timeEntriesAPI.approve(entryId);
        if (err) throw err;

        if (!data) {
          setError('Este apontamento já foi processado ou não está mais disponível.');
          setActionLoading(null);
          return;
        }

        setSuccessMessage('Apontamento aprovado com sucesso!');
        await fetchPendingEntries();
      } catch (err) {
        const message = err instanceof Error ? mapDatabaseError(err) : 'Erro ao aprovar';
        setError(message);
        logError(err, 'usePendingTimeEntries.approve');
      } finally {
        setActionLoading(null);
      }
    },
    [fetchPendingEntries]
  );

  const reject = useCallback(
    async (entryId: string) => {
      try {
        setActionLoading(entryId);
        setSuccessMessage(null);
        setError(null);

        const { data, error: err } = await timeEntriesAPI.reject(entryId);
        if (err) throw err;

        if (!data) {
          setError('Este apontamento já foi processado ou não está mais disponível.');
          setActionLoading(null);
          return;
        }

        setSuccessMessage('Apontamento rejeitado com sucesso!');
        await fetchPendingEntries();
      } catch (err) {
        const message = err instanceof Error ? mapDatabaseError(err) : 'Erro ao rejeitar';
        setError(message);
        logError(err, 'usePendingTimeEntries.reject');
      } finally {
        setActionLoading(null);
      }
    },
    [fetchPendingEntries]
  );

  return {
    entries,
    loading,
    error,
    actionLoading,
    successMessage,
    approve,
    reject,
    refetch: fetchPendingEntries,
  };
}
