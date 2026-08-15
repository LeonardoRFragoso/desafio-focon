import { useState, useEffect, useCallback } from 'react';
import { capacityAPI } from '@/lib/supabase/api';
import { mapDatabaseError } from '@/lib/errors';
import type { MyAllocations, CapacityStatus } from '@/types/database';

const STATUS_LABELS: Record<CapacityStatus, string> = {
  available: 'Disponível',
  well_allocated: 'Bem alocado',
  overloaded: 'Sobrecarregado',
  no_capacity: 'Sem capacidade',
};

const STATUS_STYLES: Record<CapacityStatus, string> = {
  available: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  well_allocated: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
  overloaded: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  no_capacity: 'bg-slate-100 text-slate-600 dark:bg-surface-secondary text-app-muted',
};

const ALLOCATION_TYPE_LABELS: Record<string, string> = {
  planned: 'Planejado',
  confirmed: 'Confirmado',
  tentative: 'Tentativa',
};

function formatMinutes(min: number | null | undefined): string {
  if (min === null || min === undefined) return '—';
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (m === 0) return `${h}h`;
  return `${h}h${m.toString().padStart(2, '0')}`;
}

function formatDate(d: string): string {
  return new Date(d + 'T00:00:00').toLocaleDateString('pt-BR');
}

export function MyAllocationCard() {
  const [data, setData] = useState<MyAllocations | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAllocations = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const { data: result, error: err } = await capacityAPI.getMyAllocations();
      if (err) throw err;
      setData(result as unknown as MyAllocations);
    } catch (err) {
      setError(err instanceof Error ? mapDatabaseError(err) : 'Erro ao carregar alocação');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchAllocations();
  }, [fetchAllocations]);

  if (loading) {
    return (
      <div className="bg-surface-primary rounded-xl border border-app-primary p-6 shadow-sm">
        <h3 className="text-lg font-semibold text-app-primary mb-4">Minha Alocação</h3>
        <div className="flex justify-center py-4">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-focon-600"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-surface-primary rounded-xl border border-app-primary p-6 shadow-sm">
        <h3 className="text-lg font-semibold text-app-primary mb-4">Minha Alocação</h3>
        <p className="text-sm text-app-muted">{error}</p>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="bg-surface-primary rounded-xl border border-app-primary p-6 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-app-primary">Minha Alocação</h3>
        <span
          className={`inline-block px-2.5 py-1 rounded-full text-xs font-semibold ${STATUS_STYLES[data.status]}`}
        >
          {STATUS_LABELS[data.status]}
        </span>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
        <div>
          <p className="text-xs text-app-muted">Capacidade</p>
          <p className="text-lg font-semibold text-app-primary">{formatMinutes(data.capacity_minutes)}</p>
        </div>
        <div>
          <p className="text-xs text-app-muted">Alocado</p>
          <p className="text-lg font-semibold text-app-primary">{formatMinutes(data.allocated_minutes)}</p>
        </div>
        <div>
          <p className="text-xs text-app-muted">Disponível</p>
          <p className="text-lg font-semibold text-app-primary">{formatMinutes(data.available_minutes)}</p>
        </div>
        <div>
          <p className="text-xs text-app-muted">Realizado</p>
          <p className="text-lg font-semibold text-app-primary">{formatMinutes(data.actual_minutes)}</p>
        </div>
      </div>

      {data.utilization_percent !== null && (
        <div className="mb-4">
          <div className="flex justify-between text-xs text-app-muted mb-1">
            <span>Utilização</span>
            <span>{data.utilization_percent}%</span>
          </div>
          <div className="w-full bg-surface-secondary rounded-full h-2">
            <div
              className={`h-2 rounded-full transition-all ${
                data.status === 'overloaded'
                  ? 'bg-red-500'
                  : data.status === 'well_allocated'
                    ? 'bg-amber-500'
                    : 'bg-focon-600'
              }`}
              style={{ width: `${Math.min(data.utilization_percent, 100)}%` }}
            />
          </div>
        </div>
      )}

      {data.allocations.length > 0 ? (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-app-muted uppercase tracking-wide">Projetos</p>
          {data.allocations.map((alloc) => (
            <div
              key={alloc.id}
              className="flex flex-wrap items-center gap-3 text-sm text-app-secondary py-1.5 border-b border-app-primary last:border-0"
            >
              <span className="font-medium text-app-primary">{alloc.project_name}</span>
              <span>{formatMinutes(alloc.allocated_minutes)}</span>
              <span className="text-app-muted">
                {formatDate(alloc.start_date)} → {formatDate(alloc.end_date)}
              </span>
              <span className="text-xs px-2 py-0.5 rounded bg-surface-elevated text-app-muted">
                {ALLOCATION_TYPE_LABELS[alloc.allocation_type] ?? alloc.allocation_type}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-app-muted">Nenhuma alocação para o período atual</p>
      )}

      <p className="text-xs text-app-muted mt-3">
        Período: {formatDate(data.period.start_date)} → {formatDate(data.period.end_date)}
      </p>
    </div>
  );
}
