import { useState, useEffect, useCallback, useRef } from 'react';
import { projectMilestonesAPI, profilesAPI } from '@/lib/supabase/api';
import { mapDatabaseError } from '@/lib/errors';
import { Modal } from '@/components/Modal';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import type {
  ProjectMilestone,
  MilestoneStatus,
  MilestonePriority,
  Profile,
} from '@/types/database';

interface ProjectMilestonesTabProps {
  projectId: string;
  isAdmin: boolean;
  highlightMilestoneId?: string | null;
  onMilestoneHighlightCleared?: () => void;
}

const STATUS_LABELS: Record<MilestoneStatus, string> = {
  planned: 'Planejado',
  in_progress: 'Em Andamento',
  blocked: 'Bloqueado',
  completed: 'Concluído',
  cancelled: 'Cancelado',
};

const STATUS_COLORS: Record<MilestoneStatus, string> = {
  planned: 'bg-slate-100 text-slate-800 bg-surface-secondary text-app-secondary',
  in_progress: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  blocked: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  completed: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  cancelled: 'bg-slate-100 text-slate-600 bg-surface-secondary text-app-muted',
};

const PRIORITY_LABELS: Record<MilestonePriority, string> = {
  low: 'Baixa',
  medium: 'Média',
  high: 'Alta',
  critical: 'Crítica',
};

const PRIORITY_COLORS: Record<MilestonePriority, string> = {
  low: 'bg-slate-100 text-slate-600 bg-surface-secondary text-app-muted',
  medium: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
  high: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400',
  critical: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
};

const STATUS_OPTIONS: MilestoneStatus[] = ['planned', 'in_progress', 'blocked', 'completed', 'cancelled'];
const PRIORITY_OPTIONS: MilestonePriority[] = ['low', 'medium', 'high', 'critical'];

function formatDate(d: string | null): string {
  return d ? new Date(d).toLocaleDateString('pt-BR') : '—';
}

function isOverdue(dueDate: string | null, status: MilestoneStatus): boolean {
  if (!dueDate || status === 'completed' || status === 'cancelled') return false;
  return new Date(dueDate) < new Date(new Date().toDateString());
}

function daysUntil(dueDate: string | null): number | null {
  if (!dueDate) return null;
  const today = new Date(new Date().toDateString());
  const due = new Date(dueDate);
  return Math.round((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

interface MilestoneFormData {
  name: string;
  description: string;
  status: MilestoneStatus;
  priority: MilestonePriority;
  owner_id: string | null;
  start_date: string | null;
  due_date: string | null;
  progress_percent: number;
  weight: number;
  position: number;
}

const EMPTY_FORM: MilestoneFormData = {
  name: '',
  description: '',
  status: 'planned',
  priority: 'medium',
  owner_id: null,
  start_date: null,
  due_date: null,
  progress_percent: 0,
  weight: 1.0,
  position: 0,
};

export function ProjectMilestonesTab({
  projectId,
  isAdmin,
  highlightMilestoneId,
  onMilestoneHighlightCleared,
}: ProjectMilestonesTabProps) {
  const [milestones, setMilestones] = useState<ProjectMilestone[]>([]);
  const [professionals, setProfessionals] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [editTarget, setEditTarget] = useState<ProjectMilestone | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ProjectMilestone | null>(null);
  const [formData, setFormData] = useState<MilestoneFormData>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const fetchMilestones = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const { data, error: err } = await projectMilestonesAPI.listByProject(projectId);
      if (err) throw err;
      setMilestones((data as ProjectMilestone[]) || []);
    } catch (err) {
      setError(err instanceof Error ? mapDatabaseError(err) : 'Erro ao carregar marcos');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  const fetchMeta = useCallback(async () => {
    if (!isAdmin) return;
    const { data } = await profilesAPI.list();
    if (data) setProfessionals(data as Profile[]);
  }, [isAdmin]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchMilestones();
    fetchMeta();
  }, [fetchMilestones, fetchMeta]);

  // Scroll to highlighted milestone and auto-clear after 5s
  const hasScrolledRef = useRef(false);
  useEffect(() => {
    if (!highlightMilestoneId) return undefined;
    if (loading) return undefined;

    const targetExists = milestones.some((m) => m.id === highlightMilestoneId);

    if (targetExists && !hasScrolledRef.current) {
      hasScrolledRef.current = true;
      requestAnimationFrame(() => {
        const el = document.getElementById(`milestone-${highlightMilestoneId}`);
        el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
      const clearTimer = setTimeout(() => {
        onMilestoneHighlightCleared?.();
      }, 5000);
      return () => clearTimeout(clearTimer);
    }

    if (!targetExists && !hasScrolledRef.current) {
      hasScrolledRef.current = true;
      const clearTimer = setTimeout(() => {
        onMilestoneHighlightCleared?.();
      }, 1000);
      return () => clearTimeout(clearTimer);
    }

    return undefined;
  }, [highlightMilestoneId, milestones, loading, onMilestoneHighlightCleared]);

  useEffect(() => {
    hasScrolledRef.current = false;
  }, [highlightMilestoneId]);

  const openCreate = () => {
    setFormData({ ...EMPTY_FORM, position: milestones.length });
    setEditTarget(null);
    setCreateOpen(true);
  };

  const openEdit = (milestone: ProjectMilestone) => {
    setFormData({
      name: milestone.name,
      description: milestone.description ?? '',
      status: milestone.status,
      priority: milestone.priority,
      owner_id: milestone.owner_id,
      start_date: milestone.start_date,
      due_date: milestone.due_date,
      progress_percent: milestone.progress_percent,
      weight: milestone.weight,
      position: milestone.position,
    });
    setEditTarget(milestone);
    setCreateOpen(true);
  };

  const handleSave = async () => {
    if (!formData.name.trim()) {
      setActionError('Nome do marco é obrigatório');
      return;
    }
    setSaving(true);
    setActionError(null);
    try {
      const payload = {
        name: formData.name.trim(),
        description: formData.description.trim() || null,
        status: formData.status,
        priority: formData.priority,
        owner_id: formData.owner_id || null,
        start_date: formData.start_date,
        due_date: formData.due_date,
        progress_percent: formData.progress_percent,
        weight: formData.weight,
        position: formData.position,
      };
      if (editTarget) {
        const { error: err } = await projectMilestonesAPI.update(editTarget.id, payload);
        if (err) throw err;
      } else {
        const { error: err } = await projectMilestonesAPI.create({
          project_id: projectId,
          ...payload,
        });
        if (err) throw err;
      }
      setCreateOpen(false);
      setEditTarget(null);
      await fetchMilestones();
    } catch (err) {
      setActionError(err instanceof Error ? mapDatabaseError(err) : 'Erro ao salvar marco');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setSaving(true);
    setActionError(null);
    try {
      const { error: err } = await projectMilestonesAPI.remove(deleteTarget.id);
      if (err) throw err;
      setDeleteTarget(null);
      await fetchMilestones();
    } catch (err) {
      setActionError(err instanceof Error ? mapDatabaseError(err) : 'Erro ao excluir marco');
    } finally {
      setSaving(false);
    }
  };

  const handleStatusChange = async (milestoneId: string, newStatus: MilestoneStatus) => {
    setActionError(null);
    const updates: Partial<{ status: string; completed_at: string | null }> = {
      status: newStatus,
      completed_at: newStatus === 'completed' ? new Date().toISOString() : null,
    };
    const { error: err } = await projectMilestonesAPI.update(milestoneId, updates);
    if (err) {
      setActionError(mapDatabaseError(err));
      return;
    }
    await fetchMilestones();
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-focon-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap justify-between items-center gap-3">
        <h3 className="text-lg font-semibold text-app-primary">Marcos do Projeto</h3>
        {isAdmin && (
          <button
            onClick={openCreate}
            className="px-4 py-2 bg-focon-600 hover:bg-focon-700 text-white rounded-lg font-medium transition text-sm"
          >
            Novo Marco
          </button>
        )}
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-4">
          <p className="text-sm font-medium text-red-800 dark:text-red-400">{error}</p>
        </div>
      )}
      {actionError && (
        <div className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-red-800 dark:text-red-400">{actionError}</p>
            <button
              onClick={() => setActionError(null)}
              className="ml-4 text-sm text-red-700 dark:text-red-300 hover:underline"
            >
              Dispensar
            </button>
          </div>
        </div>
      )}

      {milestones.length === 0 ? (
        <div className="rounded-xl border border-app-primary bg-surface-primary p-6 text-center">
          <p className="text-sm text-app-muted">Nenhum marco cadastrado para este projeto.</p>
          {isAdmin && (
            <button
              onClick={openCreate}
              className="mt-3 px-4 py-2 bg-focon-600 hover:bg-focon-700 text-white rounded-lg font-medium transition text-sm"
            >
              Criar Primeiro Marco
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {milestones.map((m) => {
            const overdue = isOverdue(m.due_date, m.status);
            const daysLeft = daysUntil(m.due_date);
            return (
              <div
                key={m.id}
                id={`milestone-${m.id}`}
                className={`rounded-xl border bg-surface-primary p-4 transition ${
                  highlightMilestoneId === m.id
                    ? 'border-focon-500 ring-2 ring-focon-200 dark:ring-focon-900/50'
                    : 'border-app-primary hover:border-app-strong'
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="font-semibold text-app-primary">{m.name}</h4>
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${STATUS_COLORS[m.status]}`}>
                        {STATUS_LABELS[m.status]}
                      </span>
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${PRIORITY_COLORS[m.priority]}`}>
                        {PRIORITY_LABELS[m.priority]}
                      </span>
                      {overdue && (
                        <span className="inline-block px-2 py-0.5 rounded-full text-xs font-bold bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300">
                          ATRASADO
                        </span>
                      )}
                      {!overdue && daysLeft !== null && daysLeft >= 0 && daysLeft <= 7 && m.status !== 'completed' && (
                        <span className="inline-block px-2 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                          {daysLeft === 0 ? 'HOJE' : `${daysLeft}d`}
                        </span>
                      )}
                    </div>
                    {m.description && (
                      <p className="text-sm text-app-muted mt-1 line-clamp-2">{m.description}</p>
                    )}
                    <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-app-muted">
                      <span>Responsável: {m.owner?.full_name ?? '—'}</span>
                      <span>Início: {formatDate(m.start_date)}</span>
                      <span className={overdue ? 'text-red-600 dark:text-red-400 font-medium' : ''}>
                        Prazo: {formatDate(m.due_date)}
                      </span>
                      <span>Peso: {m.weight}</span>
                    </div>
                    {/* Progress bar */}
                    <div className="mt-3">
                      <div className="flex items-center justify-between text-xs text-app-muted mb-1">
                        <span>Progresso</span>
                        <span className="font-medium text-app-secondary">{m.progress_percent.toFixed(0)}%</span>
                      </div>
                      <div className="h-2 rounded-full bg-surface-secondary overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${
                            m.progress_percent >= 100
                              ? 'bg-green-500'
                              : m.progress_percent > 0
                              ? 'bg-focon-600'
                              : 'bg-slate-300'
                          }`}
                          style={{ width: `${Math.min(m.progress_percent, 100)}%` }}
                        />
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {isAdmin && (
                      <>
                        <select
                          value={m.status}
                          onChange={(e) => handleStatusChange(m.id, e.target.value as MilestoneStatus)}
                          className="text-xs rounded-md border border-app-strong bg-surface-primary text-app-secondary px-2 py-1"
                          aria-label={`Alterar status de ${m.name}`}
                        >
                          {STATUS_OPTIONS.map((s) => (
                            <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                          ))}
                        </select>
                        <button
                          onClick={() => openEdit(m)}
                          className="px-3 py-1.5 text-sm font-medium text-app-secondary bg-surface-secondary hover:bg-hover-surface rounded-lg transition"
                        >
                          Editar
                        </button>
                        <button
                          onClick={() => setDeleteTarget(m)}
                          className="px-3 py-1.5 text-sm font-medium text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/40 rounded-lg transition"
                        >
                          Excluir
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create / Edit Modal */}
      <Modal
        open={createOpen}
        onClose={() => {
          setCreateOpen(false);
          setEditTarget(null);
          setActionError(null);
        }}
        title={editTarget ? 'Editar Marco' : 'Novo Marco'}
        maxWidth="max-w-2xl"
        footer={
          <>
            <button
              onClick={() => {
                setCreateOpen(false);
                setEditTarget(null);
                setActionError(null);
              }}
              className="px-4 py-2 text-sm font-medium text-app-secondary bg-surface-secondary hover:bg-hover-surface rounded-lg transition"
            >
              Cancelar
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-2 text-sm font-medium text-white bg-focon-600 hover:bg-focon-700 disabled:opacity-50 rounded-lg transition"
            >
              {saving ? 'Salvando...' : 'Salvar'}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-app-secondary mb-1">Nome *</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              maxLength={300}
              className="w-full rounded-lg border border-app-strong bg-surface-primary text-app-primary px-3 py-2 text-sm"
              placeholder="Ex: Fundações Concluídas"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-app-secondary mb-1">Descrição</label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              maxLength={5000}
              rows={3}
              className="w-full rounded-lg border border-app-strong bg-surface-primary text-app-primary px-3 py-2 text-sm"
              placeholder="Descrição do marco..."
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-app-secondary mb-1">Status</label>
              <select
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: e.target.value as MilestoneStatus })}
                className="w-full rounded-lg border border-app-strong bg-surface-primary text-app-primary px-3 py-2 text-sm"
              >
                {STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-app-secondary mb-1">Prioridade</label>
              <select
                value={formData.priority}
                onChange={(e) => setFormData({ ...formData, priority: e.target.value as MilestonePriority })}
                className="w-full rounded-lg border border-app-strong bg-surface-primary text-app-primary px-3 py-2 text-sm"
              >
                {PRIORITY_OPTIONS.map((p) => (
                  <option key={p} value={p}>{PRIORITY_LABELS[p]}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-app-secondary mb-1">Responsável</label>
            <select
              value={formData.owner_id ?? ''}
              onChange={(e) => setFormData({ ...formData, owner_id: e.target.value || null })}
              className="w-full rounded-lg border border-app-strong bg-surface-primary text-app-primary px-3 py-2 text-sm"
            >
              <option value="">— Sem responsável —</option>
              {professionals.map((p) => (
                <option key={p.id} value={p.id}>{p.full_name}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-app-secondary mb-1">Data de Início</label>
              <input
                type="date"
                value={formData.start_date ?? ''}
                onChange={(e) => setFormData({ ...formData, start_date: e.target.value || null })}
                className="w-full rounded-lg border border-app-strong bg-surface-primary text-app-primary px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-app-secondary mb-1">Prazo</label>
              <input
                type="date"
                value={formData.due_date ?? ''}
                onChange={(e) => setFormData({ ...formData, due_date: e.target.value || null })}
                className="w-full rounded-lg border border-app-strong bg-surface-primary text-app-primary px-3 py-2 text-sm"
              />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-app-secondary mb-1">Progresso (%)</label>
              <input
                type="number"
                min={0}
                max={100}
                step={1}
                value={formData.progress_percent}
                onChange={(e) => setFormData({ ...formData, progress_percent: Math.min(100, Math.max(0, Number(e.target.value) || 0)) })}
                className="w-full rounded-lg border border-app-strong bg-surface-primary text-app-primary px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-app-secondary mb-1">Peso</label>
              <input
                type="number"
                min={0.1}
                step={0.1}
                value={formData.weight}
                onChange={(e) => setFormData({ ...formData, weight: Math.max(0.1, Number(e.target.value) || 1) })}
                className="w-full rounded-lg border border-app-strong bg-surface-primary text-app-primary px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-app-secondary mb-1">Posição</label>
              <input
                type="number"
                min={0}
                step={1}
                value={formData.position}
                onChange={(e) => setFormData({ ...formData, position: Math.max(0, Number(e.target.value) || 0) })}
                className="w-full rounded-lg border border-app-strong bg-surface-primary text-app-primary px-3 py-2 text-sm"
              />
            </div>
          </div>
          {actionError && (
            <div className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-3">
              <p className="text-sm text-red-800 dark:text-red-400">{actionError}</p>
            </div>
          )}
        </div>
      </Modal>

      {/* Delete confirmation */}
      <ConfirmDialog
        open={!!deleteTarget}
        title="Excluir Marco"
        message={`Tem certeza que deseja excluir o marco "${deleteTarget?.name}"? As tarefas vinculadas serão desvinculadas, mas não excluídas.`}
        confirmLabel="Excluir"
        cancelLabel="Cancelar"
        destructive
        onConfirm={handleDelete}
        onClose={() => setDeleteTarget(null)}
      />
    </div>
  );
}
