import { useState, useCallback, useEffect } from 'react';
import { timeEntriesAPI } from '@/lib/supabase/api';
import { mapDatabaseError, logError } from '@/lib/errors';
import type { TimeEntryWithRelations, BatchApprovalResult } from '@/types/database';

interface UsePendingTimeEntriesReturn {
  entries: TimeEntryWithRelations[];
  loading: boolean;
  error: string | null;
  actionLoading: string | null;
  successMessage: string | null;
  approve: (entryId: string) => Promise<boolean>;
  reject: (entryId: string, reason: string) => Promise<boolean>;
  batchApprove: (entryIds: string[]) => Promise<BatchApprovalResult[] | null>;
  batchReject: (entryIds: string[], reason: string) => Promise<BatchApprovalResult[] | null>;
  refetch: () => Promise<void>;
}

/**
 * Custom hook for managing pending time entries (admin approval area).
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
    async (entryId: string): Promise<boolean> => {
      try {
        setActionLoading(entryId);
        setSuccessMessage(null);
        setError(null);

        const { data, error: err } = await timeEntriesAPI.approve(entryId);
        if (err) throw err;

        if (!data || (Array.isArray(data) && data.length === 0)) {
          setError('Este apontamento já foi processado ou não está mais disponível.');
          setActionLoading(null);
          return false;
        }

        setSuccessMessage('Apontamento aprovado com sucesso!');
        await fetchPendingEntries();
        return true;
      } catch (err) {
        const message = err instanceof Error ? mapDatabaseError(err) : 'Erro ao aprovar';
        setError(message);
        logError(err, 'usePendingTimeEntries.approve');
        return false;
      } finally {
        setActionLoading(null);
      }
    },
    [fetchPendingEntries]
  );

  const reject = useCallback(
    async (entryId: string, reason: string): Promise<boolean> => {
      try {
        setActionLoading(entryId);
        setSuccessMessage(null);
        setError(null);

        const { data, error: err } = await timeEntriesAPI.reject(entryId, reason);
        if (err) throw err;

        if (!data || (Array.isArray(data) && data.length === 0)) {
          setError('Este apontamento já foi processado ou não está mais disponível.');
          setActionLoading(null);
          return false;
        }

        setSuccessMessage('Apontamento rejeitado com sucesso!');
        await fetchPendingEntries();
        return true;
      } catch (err) {
        const message = err instanceof Error ? mapDatabaseError(err) : 'Erro ao rejeitar';
        setError(message);
        logError(err, 'usePendingTimeEntries.reject');
        return false;
      } finally {
        setActionLoading(null);
      }
    },
    [fetchPendingEntries]
  );

  const batchApprove = useCallback(
    async (entryIds: string[]): Promise<BatchApprovalResult[] | null> => {
      if (entryIds.length === 0) return [];
      try {
        setActionLoading('batch');
        setSuccessMessage(null);
        setError(null);

        const { data, error: err } = await timeEntriesAPI.batchApprove(entryIds);
        if (err) throw err;

        const results = (data as BatchApprovalResult[]) || [];
        const ok = results.filter((r) => r.status === 'approved').length;
        const failed = results.filter((r) => r.status === 'failed').length;
        setSuccessMessage(`${ok} apontamento(s) aprovado(s)${failed ? `, ${failed} falhou/falharam` : ''}.`);
        await fetchPendingEntries();
        return results;
      } catch (err) {
        const message = err instanceof Error ? mapDatabaseError(err) : 'Erro na aprovação em lote';
        setError(message);
        logError(err, 'usePendingTimeEntries.batchApprove');
        return null;
      } finally {
        setActionLoading(null);
      }
    },
    [fetchPendingEntries]
  );

  const batchReject = useCallback(
    async (entryIds: string[], reason: string): Promise<BatchApprovalResult[] | null> => {
      if (entryIds.length === 0) return [];
      try {
        setActionLoading('batch');
        setSuccessMessage(null);
        setError(null);

        const { data, error: err } = await timeEntriesAPI.batchReject(entryIds, reason);
        if (err) throw err;

        const results = (data as BatchApprovalResult[]) || [];
        const ok = results.filter((r) => r.status === 'rejected').length;
        const failed = results.filter((r) => r.status === 'failed').length;
        setSuccessMessage(`${ok} apontamento(s) rejeitado(s)${failed ? `, ${failed} falhou/falharam` : ''}.`);
        await fetchPendingEntries();
        return results;
      } catch (err) {
        const message = err instanceof Error ? mapDatabaseError(err) : 'Erro na rejeição em lote';
        setError(message);
        logError(err, 'usePendingTimeEntries.batchReject');
        return null;
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
    batchApprove,
    batchReject,
    refetch: fetchPendingEntries,
  };
}
