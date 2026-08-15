import { useState, useEffect, useCallback, useMemo } from 'react';
import { projectTasksAPI, projectPhasesAPI, profilesAPI } from '@/lib/supabase/api';
import { mapDatabaseError } from '@/lib/errors';
import { Modal } from '@/components/Modal';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import type { ProjectTask, TaskStatus, TaskPriority, ProjectPhase, Profile } from '@/types/database';

interface ProjectTasksTabProps {
  projectId: string;
  isAdmin: boolean;
  highlightTaskId?: string | null;
  onTaskHighlightCleared?: () => void;
}

const STATUS_LABELS: Record<TaskStatus, string> = {
  todo: 'A Fazer',
  in_progress: 'Em Andamento',
  blocked: 'Bloqueada',
  done: 'Concluída',
  cancelled: 'Cancelada',
};

const STATUS_COLORS: Record<TaskStatus, string> = {
  todo: 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300',
  in_progress: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  blocked: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  done: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  cancelled: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-500',
};

const PRIORITY_LABELS: Record<TaskPriority, string> = {
  low: 'Baixa',
  medium: 'Média',
  high: 'Alta',
  critical: 'Crítica',
};

const PRIORITY_COLORS: Record<TaskPriority, string> = {
  low: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
  medium: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
  high: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400',
  critical: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
};

const KANBAN_COLUMNS: TaskStatus[] = ['todo', 'in_progress', 'blocked', 'done'];

export function ProjectTasksTab({ projectId, isAdmin, highlightTaskId, onTaskHighlightCleared }: ProjectTasksTabProps) {
  const [tasks, setTasks] = useState<ProjectTask[]>([]);
  const [phases, setPhases] = useState<ProjectPhase[]>([]);
  const [professionals, setProfessionals] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<'list' | 'board'>('list');
  const [editTarget, setEditTarget] = useState<ProjectTask | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ProjectTask | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const fetchTasks = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const { data, error: err } = await projectTasksAPI.listByProject(projectId);
      if (err) throw err;
      setTasks((data as ProjectTask[]) || []);
    } catch (err) {
      setError(err instanceof Error ? mapDatabaseError(err) : 'Erro ao carregar tarefas');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  const fetchMeta = useCallback(async () => {
    const [{ data: phaseData }, { data: profData }] = await Promise.all([
      projectPhasesAPI.listByProject(projectId),
      profilesAPI.list(),
    ]);
    if (phaseData) setPhases(phaseData as ProjectPhase[]);
    if (profData) setProfessionals(profData as Profile[]);
  }, [projectId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchTasks();
    if (isAdmin) {
      fetchMeta();
    }
  }, [fetchTasks, fetchMeta, isAdmin]);

  // Scroll to highlighted task and auto-clear after 5s.
  // The task list loads asynchronously, so the target element may not exist
  // when the deep link first resolves. We poll briefly (rAF) until the element
  // is present, then scroll. The 5s highlight timer starts only after the
  // scroll actually happens, so the highlight is always visible to the user.
  useEffect(() => {
    if (!highlightTaskId) return;
    let cancelled = false;
    let clearTimer: ReturnType<typeof setTimeout> | null = null;

    const tryScroll = (attempts = 0) => {
      if (cancelled) return;
      const el = document.getElementById(`task-${highlightTaskId}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        clearTimer = setTimeout(() => {
          if (!cancelled) onTaskHighlightCleared?.();
        }, 5000);
        return;
      }
      // Element not rendered yet — retry on the next frame (up to ~2s).
      if (attempts < 120) {
        requestAnimationFrame(() => tryScroll(attempts + 1));
      } else {
        // Fallback: clear the highlight even if the task never appeared
        // (e.g. it was deleted or belongs to another project).
        clearTimer = setTimeout(() => {
          if (!cancelled) onTaskHighlightCleared?.();
        }, 5000);
      }
    };

    tryScroll();

    return () => {
      cancelled = true;
      if (clearTimer) clearTimeout(clearTimer);
    };
  }, [highlightTaskId, onTaskHighlightCleared, tasks]);

  const formatDate = (d: string | null) => (d ? new Date(d).toLocaleDateString('pt-BR') : '—');
  const formatHours = (m: number | null) => (m ? `${(m / 60).toFixed(1)}h` : '—');

  const kanbanTasks = useMemo(() => {
    const groups: Record<TaskStatus, ProjectTask[]> = {
      todo: [],
      in_progress: [],
      blocked: [],
      done: [],
      cancelled: [],
    };
    for (const t of tasks) {
      if (groups[t.status]) groups[t.status].push(t);
    }
    return groups;
  }, [tasks]);

  const handleStatusChange = async (taskId: string, newStatus: TaskStatus) => {
    const updates: Partial<{ status: string; completed_at: string | null }> = {
      status: newStatus,
      completed_at: newStatus === 'done' ? new Date().toISOString() : null,
    };
    const { error: err } = await projectTasksAPI.update(taskId, updates);
    if (err) {
      setActionError(mapDatabaseError(err));
      return;
    }
    await fetchTasks();
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
        <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Tarefas</h3>
        <div className="flex gap-2">
          {/* View toggle */}
          <div className="inline-flex rounded-lg border border-slate-300 dark:border-slate-600 overflow-hidden">
            <button
              onClick={() => setView('list')}
              className={`px-3 py-1.5 text-sm font-medium transition ${
                view === 'list'
                  ? 'bg-focon-600 text-white'
                  : 'bg-surface-primary text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              Lista
            </button>
            <button
              onClick={() => setView('board')}
              className={`px-3 py-1.5 text-sm font-medium transition ${
                view === 'board'
                  ? 'bg-focon-600 text-white'
                  : 'bg-surface-primary text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              Board
            </button>
          </div>
          {isAdmin && (
            <button
              onClick={() => setCreateOpen(true)}
              className="px-4 py-2 bg-focon-600 hover:bg-focon-700 text-white rounded-lg font-medium transition text-sm"
            >
              Nova Tarefa
            </button>
          )}
        </div>
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

      {tasks.length === 0 ? (
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-12 text-center bg-slate-50 dark:bg-slate-800/50">
          <p className="text-slate-600 dark:text-slate-400">Nenhuma tarefa cadastrada</p>
          <p className="text-sm text-slate-400 dark:text-slate-500 mt-1">
            Crie tarefas para organizar o trabalho do projeto.
          </p>
        </div>
      ) : view === 'list' ? (
        <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
          <table className="w-full">
            <thead className="bg-slate-100 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-semibold text-slate-900 dark:text-slate-100">Título</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-slate-900 dark:text-slate-100">Fase</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-slate-900 dark:text-slate-100">Status</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-slate-900 dark:text-slate-100">Prioridade</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-slate-900 dark:text-slate-100">Responsável</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-slate-900 dark:text-slate-100">Prazo</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-slate-900 dark:text-slate-100">Horas</th>
                {isAdmin && <th className="px-4 py-3 text-left text-sm font-semibold text-slate-900 dark:text-slate-100">Ações</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
              {tasks.map((t) => (
                <tr
                  key={t.id}
                  id={`task-${t.id}`}
                  className={`transition ${
                    highlightTaskId === t.id
                      ? 'bg-focon-50 dark:bg-focon-900/30 ring-2 ring-focon-400'
                      : 'hover:bg-slate-50 dark:hover:bg-slate-800'
                  }`}
                >
                  <td className="px-4 py-3 text-sm text-slate-900 dark:text-slate-100 font-medium">{t.title}</td>
                  <td className="px-4 py-3 text-sm text-slate-700 dark:text-slate-300">
                    {t.phase?.name ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    {isAdmin ? (
                      <select
                        value={t.status}
                        onChange={(e) => handleStatusChange(t.id, e.target.value as TaskStatus)}
                        className={`px-2.5 py-1 rounded-full text-xs font-semibold border-0 cursor-pointer ${STATUS_COLORS[t.status] || STATUS_COLORS['todo']}`}
                      >
                        {Object.entries(STATUS_LABELS).map(([val, label]) => (
                          <option key={val} value={val}>
                            {label}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-semibold ${STATUS_COLORS[t.status] || STATUS_COLORS['todo']}`}>
                        {STATUS_LABELS[t.status] || t.status}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-semibold ${PRIORITY_COLORS[t.priority] || PRIORITY_COLORS['medium']}`}>
                      {PRIORITY_LABELS[t.priority] || t.priority}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-700 dark:text-slate-300">
                    {t.assignee?.full_name ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-700 dark:text-slate-300">
                    {formatDate(t.due_date)}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-700 dark:text-slate-300">
                    {formatHours(t.planned_minutes)}
                  </td>
                  {isAdmin && (
                    <td className="px-4 py-3 text-sm space-x-2">
                      <button
                        onClick={() => setEditTarget(t)}
                        className="px-2.5 py-1 rounded-md text-xs font-medium border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                      >
                        Editar
                      </button>
                      <button
                        onClick={() => setDeleteTarget(t)}
                        className="px-2.5 py-1 rounded-md text-xs font-medium border border-red-300 dark:border-red-700 text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition"
                      >
                        Excluir
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        /* Kanban board */
        <div className="overflow-x-auto pb-4">
          <div className="flex gap-4 min-w-max">
            {KANBAN_COLUMNS.map((col) => (
              <div key={col} className="w-72 shrink-0">
                <div className="rounded-lg bg-slate-100 dark:bg-slate-800 p-3 mb-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                      {STATUS_LABELS[col]}
                    </h4>
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                      {kanbanTasks[col].length}
                    </span>
                  </div>
                </div>
                <div className="space-y-2">
                  {kanbanTasks[col].length === 0 ? (
                    <div className="rounded-lg border border-dashed border-slate-300 dark:border-slate-600 p-6 text-center">
                      <p className="text-xs text-slate-400 dark:text-slate-500">Vazio</p>
                    </div>
                  ) : (
                    kanbanTasks[col].map((t) => (
                      <div
                        key={t.id}
                        className="rounded-lg border border-slate-200 dark:border-slate-700 bg-surface-primary p-3 shadow-sm"
                      >
                        <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                          {t.title}
                        </p>
                        {t.description && (
                          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 line-clamp-2">
                            {t.description}
                          </p>
                        )}
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${PRIORITY_COLORS[t.priority] || PRIORITY_COLORS['medium']}`}>
                            {PRIORITY_LABELS[t.priority] || t.priority}
                          </span>
                          {t.assignee?.full_name && (
                            <span className="text-xs text-slate-500 dark:text-slate-400">
                              {t.assignee.full_name}
                            </span>
                          )}
                          {t.due_date && (
                            <span className="text-xs text-slate-500 dark:text-slate-400">
                              {formatDate(t.due_date)}
                            </span>
                          )}
                        </div>
                        {isAdmin && (
                          <div className="mt-2 flex gap-1">
                            <button
                              onClick={() => setEditTarget(t)}
                              className="text-xs text-focon-600 dark:text-focon-400 hover:underline"
                            >
                              Editar
                            </button>
                            <button
                              onClick={() => setDeleteTarget(t)}
                              className="text-xs text-red-600 dark:text-red-400 hover:underline"
                            >
                              Excluir
                            </button>
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {createOpen && (
        <TaskFormModal
          projectId={projectId}
          phases={phases}
          professionals={professionals}
          onClose={() => setCreateOpen(false)}
          onSaved={() => {
            setCreateOpen(false);
            fetchTasks();
          }}
          onError={(msg) => setActionError(msg)}
        />
      )}

      {editTarget && (
        <TaskFormModal
          projectId={projectId}
          phases={phases}
          professionals={professionals}
          task={editTarget}
          onClose={() => setEditTarget(null)}
          onSaved={() => {
            setEditTarget(null);
            fetchTasks();
          }}
          onError={(msg) => setActionError(msg)}
        />
      )}

      {deleteTarget && (
        <ConfirmDialog
          open
          title="Excluir Tarefa"
          destructive
          confirmLabel="Excluir"
          onClose={() => setDeleteTarget(null)}
          onConfirm={async () => {
            const { error: err } = await projectTasksAPI.remove(deleteTarget.id);
            if (err) {
              setActionError(mapDatabaseError(err));
              return;
            }
            setDeleteTarget(null);
            await fetchTasks();
          }}
          message={
            <p>
              Tem certeza que deseja excluir a tarefa <strong>{deleteTarget.title}</strong>?
            </p>
          }
        />
      )}
    </div>
  );
}

interface TaskFormModalProps {
  projectId: string;
  phases: ProjectPhase[];
  professionals: Profile[];
  task?: ProjectTask;
  onClose: () => void;
  onSaved: () => void;
  onError: (msg: string) => void;
}

function TaskFormModal({ projectId, phases, professionals, task, onClose, onSaved, onError }: TaskFormModalProps) {
  const [title, setTitle] = useState(task?.title ?? '');
  const [description, setDescription] = useState(task?.description ?? '');
  const [status, setStatus] = useState<TaskStatus>((task?.status as TaskStatus) ?? 'todo');
  const [priority, setPriority] = useState<TaskPriority>((task?.priority as TaskPriority) ?? 'medium');
  const [phaseId, setPhaseId] = useState(task?.phase_id ?? '');
  const [assigneeId, setAssigneeId] = useState(task?.assignee_id ?? '');
  const [plannedMinutes, setPlannedMinutes] = useState(
    task?.planned_minutes ? String(task.planned_minutes) : ''
  );
  const [startDate, setStartDate] = useState(task?.start_date ?? '');
  const [dueDate, setDueDate] = useState(task?.due_date ?? '');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      onError('Título é obrigatório.');
      return;
    }
    setSubmitting(true);
    try {
      const data = {
        title: title.trim(),
        description: description.trim() || null,
        status,
        priority,
        phase_id: phaseId || null,
        assignee_id: assigneeId || null,
        planned_minutes: plannedMinutes ? Number(plannedMinutes) : null,
        start_date: startDate || null,
        due_date: dueDate || null,
      };
      const { error: err } = task
        ? await projectTasksAPI.update(task.id, data)
        : await projectTasksAPI.create({ project_id: projectId, ...data });
      if (err) throw err;
      onSaved();
    } catch (err) {
      onError(err instanceof Error ? mapDatabaseError(err) : 'Erro ao salvar tarefa');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={task ? 'Editar Tarefa' : 'Nova Tarefa'}
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
            form="task-form"
            disabled={submitting}
            className="px-4 py-2 rounded-lg bg-focon-600 hover:bg-focon-700 text-white transition disabled:opacity-50"
          >
            {submitting ? 'Salvando...' : 'Salvar'}
          </button>
        </>
      }
    >
      <form id="task-form" onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
            Título *
          </label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
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
              Fase
            </label>
            <select
              value={phaseId}
              onChange={(e) => setPhaseId(e.target.value)}
              className="w-full px-3 py-2.5 border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-focon-600"
            >
              <option value="">Sem fase</option>
              {phases.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Responsável
            </label>
            <select
              value={assigneeId}
              onChange={(e) => setAssigneeId(e.target.value)}
              className="w-full px-3 py-2.5 border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-focon-600"
            >
              <option value="">Sem responsável</option>
              {professionals.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.full_name}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Status
            </label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as TaskStatus)}
              className="w-full px-3 py-2.5 border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-focon-600"
            >
              {Object.entries(STATUS_LABELS).map(([val, label]) => (
                <option key={val} value={val}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Prioridade
            </label>
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value as TaskPriority)}
              className="w-full px-3 py-2.5 border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-focon-600"
            >
              {Object.entries(PRIORITY_LABELS).map(([val, label]) => (
                <option key={val} value={val}>
                  {label}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Horas (min)
            </label>
            <input
              type="number"
              min={0}
              value={plannedMinutes}
              onChange={(e) => setPlannedMinutes(e.target.value)}
              className="w-full px-3 py-2.5 border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-focon-600"
            />
          </div>
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
