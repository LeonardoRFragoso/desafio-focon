import { useState, useEffect, useCallback } from 'react';
import { projectPhasesAPI } from '@/lib/supabase/api';
import { mapDatabaseError } from '@/lib/errors';
import { Modal } from '@/components/Modal';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import type { ProjectPhase, PhaseStatus } from '@/types/database';

interface ProjectPhasesTabProps {
  projectId: string;
}

const STATUS_LABELS: Record<PhaseStatus, string> = {
  planned: 'Planejada',
  active: 'Ativa',
  completed: 'Concluída',
  cancelled: 'Cancelada',
};

const STATUS_COLORS: Record<PhaseStatus, string> = {
  planned: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  active: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  completed: 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300',
  cancelled: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
};

export function ProjectPhasesTab({ projectId }: ProjectPhasesTabProps) {
  const [phases, setPhases] = useState<ProjectPhase[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editTarget, setEditTarget] = useState<ProjectPhase | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ProjectPhase | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const fetchPhases = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const { data, error: err } = await projectPhasesAPI.listByProject(projectId);
      if (err) throw err;
      setPhases((data as ProjectPhase[]) || []);
    } catch (err) {
      setError(err instanceof Error ? mapDatabaseError(err) : 'Erro ao carregar fases');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchPhases();
  }, [fetchPhases]);

  const formatDate = (d: string | null) => (d ? new Date(d).toLocaleDateString('pt-BR') : '—');
  const formatHours = (m: number | null) => (m ? `${(m / 60).toFixed(1)}h` : '—');

  if (loading) {
    return (
      <div className="flex justify-center items-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-focon-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Fases do Projeto</h3>
        <button
          onClick={() => setCreateOpen(true)}
          className="px-4 py-2 bg-focon-600 hover:bg-focon-700 text-white rounded-lg font-medium transition text-sm"
        >
          Nova Fase
        </button>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-4">
          <p className="text-sm font-medium text-red-800 dark:text-red-400">{error}</p>
        </div>
      )}
      {actionError && (
        <div className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-4">
          <p className="text-sm font-medium text-red-800 dark:text-red-400">{actionError}</p>
        </div>
      )}

      {phases.length === 0 ? (
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-12 text-center bg-slate-50 dark:bg-slate-800/50">
          <p className="text-slate-600 dark:text-slate-400">Nenhuma fase cadastrada</p>
          <p className="text-sm text-slate-400 dark:text-slate-500 mt-1">
            Crie fases para organizar o projeto em etapas executáveis.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {phases.map((phase) => (
            <div
              key={phase.id}
              className="rounded-xl border border-slate-200 dark:border-slate-700 bg-surface-primary p-4 shadow-sm"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-mono text-slate-400">#{phase.position}</span>
                    <h4 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                      {phase.name}
                    </h4>
                    <span
                      className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                        STATUS_COLORS[phase.status] || STATUS_COLORS['planned']
                      }`}
                    >
                      {STATUS_LABELS[phase.status] || phase.status}
                    </span>
                  </div>
                  {phase.description && (
                    <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                      {phase.description}
                    </p>
                  )}
                  <div className="mt-2 flex flex-wrap gap-4 text-xs text-slate-500 dark:text-slate-400">
                    <span>Início: {formatDate(phase.start_date)}</span>
                    <span>Prazo: {formatDate(phase.due_date)}</span>
                    <span>Horas planejadas: {formatHours(phase.planned_minutes)}</span>
                    {phase.planned_cost != null && (
                      <span>Custo planejado: R$ {phase.planned_cost.toFixed(2)}</span>
                    )}
                  </div>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button
                    onClick={() => setEditTarget(phase)}
                    className="px-2.5 py-1 rounded-md text-xs font-medium border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                  >
                    Editar
                  </button>
                  <button
                    onClick={() => setDeleteTarget(phase)}
                    className="px-2.5 py-1 rounded-md text-xs font-medium border border-red-300 dark:border-red-700 text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition"
                  >
                    Excluir
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {createOpen && (
        <PhaseFormModal
          projectId={projectId}
          onClose={() => setCreateOpen(false)}
          onSaved={() => {
            setCreateOpen(false);
            fetchPhases();
          }}
          onError={(msg) => setActionError(msg)}
        />
      )}

      {editTarget && (
        <PhaseFormModal
          projectId={projectId}
          phase={editTarget}
          onClose={() => setEditTarget(null)}
          onSaved={() => {
            setEditTarget(null);
            fetchPhases();
          }}
          onError={(msg) => setActionError(msg)}
        />
      )}

      {deleteTarget && (
        <ConfirmDialog
          open
          title="Excluir Fase"
          destructive
          confirmLabel="Excluir"
          onClose={() => setDeleteTarget(null)}
          onConfirm={async () => {
            const { error: err } = await projectPhasesAPI.remove(deleteTarget.id);
            if (err) {
              setActionError(mapDatabaseError(err));
              return;
            }
            setDeleteTarget(null);
            await fetchPhases();
          }}
          message={
            <p>
              Tem certeza que deseja excluir a fase <strong>{deleteTarget.name}</strong>?
            </p>
          }
        />
      )}
    </div>
  );
}

interface PhaseFormModalProps {
  projectId: string;
  phase?: ProjectPhase;
  onClose: () => void;
  onSaved: () => void;
  onError: (msg: string) => void;
}

function PhaseFormModal({ projectId, phase, onClose, onSaved, onError }: PhaseFormModalProps) {
  const [name, setName] = useState(phase?.name ?? '');
  const [description, setDescription] = useState(phase?.description ?? '');
  const [status, setStatus] = useState<PhaseStatus>((phase?.status as PhaseStatus) ?? 'planned');
  const [position, setPosition] = useState(phase?.position ?? 0);
  const [plannedMinutes, setPlannedMinutes] = useState(
    phase?.planned_minutes ? String(phase.planned_minutes) : ''
  );
  const [plannedCost, setPlannedCost] = useState(
    phase?.planned_cost ? String(phase.planned_cost) : ''
  );
  const [startDate, setStartDate] = useState(phase?.start_date ?? '');
  const [dueDate, setDueDate] = useState(phase?.due_date ?? '');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      onError('Nome é obrigatório.');
      return;
    }
    setSubmitting(true);
    try {
      const data = {
        name: name.trim(),
        description: description.trim() || null,
        status,
        position,
        planned_minutes: plannedMinutes ? Number(plannedMinutes) : null,
        planned_cost: plannedCost ? Number(plannedCost) : null,
        start_date: startDate || null,
        due_date: dueDate || null,
      };
      const { error: err } = phase
        ? await projectPhasesAPI.update(phase.id, data)
        : await projectPhasesAPI.create({ project_id: projectId, ...data });
      if (err) throw err;
      onSaved();
    } catch (err) {
      onError(err instanceof Error ? mapDatabaseError(err) : 'Erro ao salvar fase');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={phase ? 'Editar Fase' : 'Nova Fase'}
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="submit"
            form="phase-form"
            disabled={submitting}
            className="px-4 py-2 rounded-lg bg-focon-600 hover:bg-focon-700 text-white transition disabled:opacity-50"
          >
            {submitting ? 'Salvando...' : 'Salvar'}
          </button>
        </>
      }
    >
      <form id="phase-form" onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
            Nome *
          </label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full px-3 py-2.5 border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-focon-600"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
            Descrição
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className="w-full px-3 py-2.5 border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-focon-600"
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Status
            </label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as PhaseStatus)}
              className="w-full px-3 py-2.5 border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-focon-600"
            >
              <option value="planned">Planejada</option>
              <option value="active">Ativa</option>
              <option value="completed">Concluída</option>
              <option value="cancelled">Cancelada</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Posição
            </label>
            <input
              type="number"
              min={0}
              value={position}
              onChange={(e) => setPosition(Number(e.target.value))}
              className="w-full px-3 py-2.5 border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-focon-600"
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Horas planejadas (min)
            </label>
            <input
              type="number"
              min={0}
              value={plannedMinutes}
              onChange={(e) => setPlannedMinutes(e.target.value)}
              placeholder="ex: 4800"
              className="w-full px-3 py-2.5 border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-focon-600"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Custo planejado (R$)
            </label>
            <input
              type="number"
              min={0}
              step="0.01"
              value={plannedCost}
              onChange={(e) => setPlannedCost(e.target.value)}
              placeholder="ex: 5000.00"
              className="w-full px-3 py-2.5 border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-focon-600"
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Início
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full px-3 py-2.5 border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-focon-600"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Prazo
            </label>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="w-full px-3 py-2.5 border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-focon-600"
            />
          </div>
        </div>
      </form>
    </Modal>
  );
}
