import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase/client';
import { timeEntriesAPI, projectPhasesAPI, projectTasksAPI } from '@/lib/supabase/api';
import { mapDatabaseError } from '@/lib/errors';
import { Modal } from '@/components/Modal';
import { maxEntryDate, requiresLateReason, daysLate, todayStr } from '@/features/time-entries/temporalRules';

interface QuickEntryModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
  onSaved: () => void;
}

interface Project {
  id: string;
  name: string;
}

interface Phase {
  id: string;
  name: string;
}

interface Task {
  id: string;
  title: string;
  phase_id: string | null;
}

export function QuickEntryModal({ isOpen, onClose, userId, onSaved }: QuickEntryModalProps) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [phases, setPhases] = useState<Phase[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [projectId, setProjectId] = useState('');
  const [phaseId, setPhaseId] = useState('');
  const [taskId, setTaskId] = useState('');
  const [entryDate, setEntryDate] = useState(todayStr());
  const [durationMinutes, setDurationMinutes] = useState('');
  const [description, setDescription] = useState('');
  const [lateReason, setLateReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchProjects = useCallback(async () => {
    const { data } = await supabase
      .from('projects')
      .select('id, name')
      .in('status', ['active', 'planned'])
      .order('name');
    if (data) setProjects(data as Project[]);
  }, []);

  useEffect(() => {
    if (isOpen) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      fetchProjects();
    }
  }, [isOpen, fetchProjects]);

  // Fetch phases when project changes
  useEffect(() => {
    if (!projectId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPhases([]);
      setTasks([]);
      return;
    }
    projectPhasesAPI.listByProject(projectId).then(({ data }) => {
      if (data) setPhases(data as Phase[]);
    });
    projectTasksAPI.listByProject(projectId).then(({ data }) => {
      if (data) setTasks((data as Task[]) || []);
    });
  }, [projectId]);

  // Filter tasks by selected phase
  const filteredTasks = phaseId ? tasks.filter((t) => t.phase_id === phaseId) : tasks;

  // Reset phase/task when project changes
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPhaseId('');
    setTaskId('');
  }, [projectId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!projectId) {
      setError('Selecione um projeto.');
      return;
    }
    if (!entryDate) {
      setError('Selecione uma data.');
      return;
    }
    if (entryDate > maxEntryDate()) {
      setError('Não é possível registrar horas em uma data futura.');
      return;
    }
    if (requiresLateReason(entryDate) && lateReason.trim().length < 10) {
      setError(`Este apontamento está sendo registrado com ${daysLate(entryDate)} dias de atraso. Informe o motivo do lançamento retroativo (mínimo 10 caracteres).`);
      return;
    }
    const duration = Number(durationMinutes);
    if (!duration || duration <= 0) {
      setError('Duração deve ser maior que zero.');
      return;
    }
    if (description.trim().length < 10) {
      setError('Descrição deve ter no mínimo 10 caracteres.');
      return;
    }

    setSubmitting(true);
    try {
      const { error: err } = await timeEntriesAPI.create({
        project_id: projectId,
        professional_id: userId,
        entry_date: entryDate,
        duration_minutes: duration,
        description: description.trim(),
        phase_id: phaseId || null,
        task_id: taskId || null,
        late_submission_reason: requiresLateReason(entryDate) ? lateReason.trim() : null,
      });
      if (err) throw err;
      onSaved();
      // Reset form
      setProjectId('');
      setPhaseId('');
      setTaskId('');
      setDurationMinutes('');
      setDescription('');
      setLateReason('');
      setEntryDate(todayStr());
    } catch (err) {
      setError(err instanceof Error ? mapDatabaseError(err) : 'Erro ao criar apontamento');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={isOpen}
      onClose={onClose}
      title="Novo Apontamento"
      maxWidth="max-w-lg"
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="px-4 py-2 rounded-lg border border-app-strong text-app-secondary hover:bg-hover-surface transition disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="submit"
            form="quick-entry-form"
            disabled={submitting}
            className="px-4 py-2 rounded-lg bg-focon-600 hover:bg-focon-700 text-white transition disabled:opacity-50"
          >
            {submitting ? 'Salvando...' : 'Registrar'}
          </button>
        </>
      }
    >
      <form id="quick-entry-form" onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-3" role="alert">
            <p className="text-sm text-red-800 dark:text-red-400">{error}</p>
          </div>
        )}

        <div>
          <label htmlFor="qe-project" className="block text-sm font-medium text-app-secondary mb-1">
            Projeto *
          </label>
          <select
            id="qe-project"
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            required
            className="w-full px-3 py-2.5 border border-app-strong bg-surface-secondary text-app-primary rounded-lg focus:outline-none focus:ring-2 focus:ring-focon-600"
          >
            <option value="">Selecione...</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="qe-phase" className="block text-sm font-medium text-app-secondary mb-1">
              Fase
            </label>
            <select
              id="qe-phase"
              value={phaseId}
              onChange={(e) => {
                setPhaseId(e.target.value);
                setTaskId('');
              }}
              disabled={!projectId}
              className="w-full px-3 py-2.5 border border-app-strong bg-surface-secondary text-app-primary rounded-lg focus:outline-none focus:ring-2 focus:ring-focon-600 disabled:opacity-50"
            >
              <option value="">Sem fase</option>
              {phases.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="qe-task" className="block text-sm font-medium text-app-secondary mb-1">
              Tarefa
            </label>
            <select
              id="qe-task"
              value={taskId}
              onChange={(e) => setTaskId(e.target.value)}
              disabled={!projectId}
              className="w-full px-3 py-2.5 border border-app-strong bg-surface-secondary text-app-primary rounded-lg focus:outline-none focus:ring-2 focus:ring-focon-600 disabled:opacity-50"
            >
              <option value="">Sem tarefa</option>
              {filteredTasks.map((t) => (
                <option key={t.id} value={t.id}>{t.title}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="qe-date" className="block text-sm font-medium text-app-secondary mb-1">
              Data *
            </label>
            <input
              id="qe-date"
              type="date"
              value={entryDate}
              onChange={(e) => setEntryDate(e.target.value)}
              max={maxEntryDate()}
              required
              className="w-full px-3 py-2.5 border border-app-strong bg-surface-secondary text-app-primary rounded-lg focus:outline-none focus:ring-2 focus:ring-focon-600"
            />
          </div>
          <div>
            <label htmlFor="qe-duration" className="block text-sm font-medium text-app-secondary mb-1">
              Duração (min) *
            </label>
            <input
              id="qe-duration"
              type="number"
              min="1"
              max="1440"
              value={durationMinutes}
              onChange={(e) => setDurationMinutes(e.target.value)}
              required
              placeholder="ex: 120"
              className="w-full px-3 py-2.5 border border-app-strong bg-surface-secondary text-app-primary rounded-lg focus:outline-none focus:ring-2 focus:ring-focon-600"
            />
          </div>
        </div>

        <div>
          <label htmlFor="qe-description" className="block text-sm font-medium text-app-secondary mb-1">
            Descrição *
          </label>
          <textarea
            id="qe-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            minLength={10}
            maxLength={500}
            required
            placeholder="Descreva o trabalho realizado (mínimo 10 caracteres)..."
            className="w-full px-3 py-2.5 border border-app-strong bg-surface-secondary text-app-primary rounded-lg focus:outline-none focus:ring-2 focus:ring-focon-600"
          />
          <p className="mt-1 text-xs text-slate-400">{description.length}/500</p>
        </div>

        {entryDate && requiresLateReason(entryDate) && (
          <div>
            <label htmlFor="qe-late-reason" className="block text-sm font-medium text-app-secondary mb-1">
              Justificativa do lançamento retroativo *
            </label>
            <p className="text-sm text-app-muted mb-2">
              Este apontamento está sendo registrado com {daysLate(entryDate)} dias de atraso.
              Informe o motivo do lançamento retroativo.
            </p>
            <textarea
              id="qe-late-reason"
              value={lateReason}
              onChange={(e) => setLateReason(e.target.value)}
              rows={3}
              maxLength={500}
              required
              placeholder="Ex: Estava em campo durante a semana e não pude registrar no tempo adequado..."
              className="w-full px-3 py-2.5 border border-app-strong bg-surface-secondary text-app-primary rounded-lg focus:outline-none focus:ring-2 focus:ring-focon-600"
            />
          </div>
        )}
      </form>
    </Modal>
  );
}
