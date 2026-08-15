import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase/client';
import { timeEntriesAPI, projectPhasesAPI, projectTasksAPI } from '@/lib/supabase/api';
import { mapDatabaseError } from '@/lib/errors';
import { Modal } from '@/components/Modal';

interface TimerState {
  project_id: string;
  phase_id: string | null;
  task_id: string | null;
  started_at: number; // epoch ms
  accumulated_seconds: number;
  status: 'running' | 'paused';
  paused_at: number | null;
}

const STORAGE_KEY = 'foconflow_timer';

interface Project { id: string; name: string; }
interface Phase { id: string; name: string; }
interface Task { id: string; title: string; phase_id: string | null; }

function loadTimerState(): TimerState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as TimerState;
  } catch {
    return null;
  }
}

function saveTimerState(state: TimerState | null) {
  if (state) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } else {
    localStorage.removeItem(STORAGE_KEY);
  }
}

function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

interface TimerProps {
  userId: string;
  onEntryCreated?: () => void;
}

export function Timer({ userId, onEntryCreated }: TimerProps) {
  const [timerState, setTimerState] = useState<TimerState | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [showStartModal, setShowStartModal] = useState(false);
  const [showFinishModal, setShowFinishModal] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [phases, setPhases] = useState<Phase[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [selProject, setSelProject] = useState('');
  const [selPhase, setSelPhase] = useState('');
  const [selTask, setSelTask] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Load persisted timer on mount
  useEffect(() => {
    const persisted = loadTimerState();
    if (persisted) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setTimerState(persisted);
    }
  }, []);

  // Tick when running
  useEffect(() => {
    if (timerState?.status === 'running') {
      intervalRef.current = setInterval(() => {
        setElapsed(timerState.accumulated_seconds + (Date.now() - timerState.started_at) / 1000);
      }, 1000);
      return () => {
        if (intervalRef.current) clearInterval(intervalRef.current);
      };
    } else if (timerState?.status === 'paused') {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setElapsed(timerState.accumulated_seconds);
    }
    return undefined;
  }, [timerState]);

  // Persist state changes
  useEffect(() => {
    saveTimerState(timerState);
  }, [timerState]);

  const fetchProjects = useCallback(async () => {
    const { data } = await supabase
      .from('projects')
      .select('id, name')
      .in('status', ['active', 'planned'])
      .order('name');
    if (data) setProjects(data as Project[]);
  }, []);

  // Fetch phases/tasks when project changes (for start modal)
  useEffect(() => {
    if (!selProject) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPhases([]);
      setTasks([]);
      return;
    }
    projectPhasesAPI.listByProject(selProject).then(({ data }) => {
      if (data) setPhases(data as Phase[]);
    });
    projectTasksAPI.listByProject(selProject).then(({ data }) => {
      if (data) setTasks((data as Task[]) || []);
    });
  }, [selProject]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelPhase('');
    setSelTask('');
  }, [selProject]);

  const filteredTasks = selPhase ? tasks.filter((t) => t.phase_id === selPhase) : tasks;

  const handleStart = () => {
    setError(null);
    if (!selProject) {
      setError('Selecione um projeto.');
      return;
    }
    const newState: TimerState = {
      project_id: selProject,
      phase_id: selPhase || null,
      task_id: selTask || null,
      started_at: Date.now(),
      accumulated_seconds: 0,
      status: 'running',
      paused_at: null,
    };
    setTimerState(newState);
    setShowStartModal(false);
    setSelProject('');
    setSelPhase('');
    setSelTask('');
  };

  const handlePause = () => {
    if (!timerState || timerState.status !== 'running') return;
    const elapsedSec = timerState.accumulated_seconds + (Date.now() - timerState.started_at) / 1000;
    setTimerState({
      ...timerState,
      status: 'paused',
      accumulated_seconds: elapsedSec,
      paused_at: Date.now(),
    });
  };

  const handleResume = () => {
    if (!timerState || timerState.status !== 'paused') return;
    setTimerState({
      ...timerState,
      status: 'running',
      started_at: Date.now(),
      paused_at: null,
    });
  };

  const handleCancel = () => {
    setTimerState(null);
    setElapsed(0);
    setShowFinishModal(false);
  };

  const handleFinish = () => {
    if (!timerState) return;
    // Calculate final elapsed
    let finalSeconds = timerState.accumulated_seconds;
    if (timerState.status === 'running') {
      finalSeconds += (Date.now() - timerState.started_at) / 1000;
    }
    setElapsed(finalSeconds);
    setShowFinishModal(true);
  };

  const handleConfirmFinish = async () => {
    if (!timerState) return;
    setError(null);
    if (description.trim().length < 10) {
      setError('Descrição deve ter no mínimo 10 caracteres.');
      return;
    }
    if (!userId) {
      setError('Usuário não autenticado.');
      return;
    }
    setSubmitting(true);
    try {
      const durationMinutes = Math.max(1, Math.round(elapsed / 60));
      const { error: err } = await timeEntriesAPI.create({
        project_id: timerState.project_id,
        professional_id: userId,
        entry_date: new Date().toISOString().slice(0, 10),
        duration_minutes: durationMinutes,
        description: description.trim(),
        phase_id: timerState.phase_id,
        task_id: timerState.task_id,
      });
      if (err) throw err;
      // Clear timer
      setTimerState(null);
      setElapsed(0);
      setDescription('');
      setShowFinishModal(false);
      onEntryCreated?.();
    } catch (err) {
      setError(err instanceof Error ? mapDatabaseError(err) : 'Erro ao criar apontamento');
    } finally {
      setSubmitting(false);
    }
  };

  // No active timer — show start button
  if (!timerState) {
    return (
      <>
        <button
          onClick={() => {
            setShowStartModal(true);
            fetchProjects();
          }}
          className="w-full px-4 py-3 bg-focon-600 hover:bg-focon-700 text-white rounded-xl font-medium transition flex items-center justify-center gap-2"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          Iniciar Timer
        </button>

        {showStartModal && (
          <Modal
            open
            onClose={() => setShowStartModal(false)}
            title="Iniciar Timer"
            maxWidth="max-w-lg"
            footer={
              <>
                <button
                  type="button"
                  onClick={() => setShowStartModal(false)}
                  className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  form="timer-start-form"
                  className="px-4 py-2 rounded-lg bg-focon-600 hover:bg-focon-700 text-white transition"
                >
                  Iniciar
                </button>
              </>
            }
          >
            <form id="timer-start-form" onSubmit={(e) => { e.preventDefault(); handleStart(); }} className="space-y-4">
              {error && (
                <div className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-3">
                  <p className="text-sm text-red-800 dark:text-red-400">{error}</p>
                </div>
              )}
              <div>
                <label htmlFor="timer-project" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Projeto *
                </label>
                <select
                  id="timer-project"
                  value={selProject}
                  onChange={(e) => setSelProject(e.target.value)}
                  required
                  className="w-full px-3 py-2.5 border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-focon-600"
                >
                  <option value="">Selecione...</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="timer-phase" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Fase
                  </label>
                  <select
                    id="timer-phase"
                    value={selPhase}
                    onChange={(e) => { setSelPhase(e.target.value); setSelTask(''); }}
                    disabled={!selProject}
                    className="w-full px-3 py-2.5 border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-focon-600 disabled:opacity-50"
                  >
                    <option value="">Sem fase</option>
                    {phases.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="timer-task" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Tarefa
                  </label>
                  <select
                    id="timer-task"
                    value={selTask}
                    onChange={(e) => setSelTask(e.target.value)}
                    disabled={!selProject}
                    className="w-full px-3 py-2.5 border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-focon-600 disabled:opacity-50"
                  >
                    <option value="">Sem tarefa</option>
                    {filteredTasks.map((t) => (
                      <option key={t.id} value={t.id}>{t.title}</option>
                    ))}
                  </select>
                </div>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                O timer será persistido no navegador. Você pode navegar entre páginas sem perder o progresso.
              </p>
            </form>
          </Modal>
        )}
      </>
    );
  }

  // Active timer — show timer card
  return (
    <>
      <div className="rounded-xl border border-focon-200 dark:border-focon-800 bg-focon-50 dark:bg-focon-900/20 p-4 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-sm font-semibold text-focon-700 dark:text-focon-300">Timer em andamento</h4>
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${timerState.status === 'running' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'}`}>
            {timerState.status === 'running' ? 'Rodando' : 'Pausado'}
          </span>
        </div>
        <div className="text-center mb-4">
          <p className="text-4xl font-mono font-bold text-slate-900 dark:text-slate-100 tabular-nums">
            {formatTime(elapsed)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 justify-center">
          {timerState.status === 'running' && (
            <button
              onClick={handlePause}
              className="px-3 py-1.5 rounded-lg bg-yellow-600 hover:bg-yellow-700 text-white text-sm font-medium transition"
            >
              Pausar
            </button>
          )}
          {timerState.status === 'paused' && (
            <button
              onClick={handleResume}
              className="px-3 py-1.5 rounded-lg bg-green-600 hover:bg-green-700 text-white text-sm font-medium transition"
            >
              Continuar
            </button>
          )}
          <button
            onClick={handleFinish}
            className="px-3 py-1.5 rounded-lg bg-focon-600 hover:bg-focon-700 text-white text-sm font-medium transition"
          >
            Finalizar
          </button>
          <button
            onClick={handleCancel}
            className="px-3 py-1.5 rounded-lg border border-red-300 dark:border-red-700 text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 text-sm font-medium transition"
          >
            Cancelar
          </button>
        </div>
      </div>

      {showFinishModal && (
        <Modal
          open
          onClose={() => setShowFinishModal(false)}
          title="Finalizar Apontamento"
          maxWidth="max-w-lg"
          footer={
            <>
              <button
                type="button"
                onClick={() => setShowFinishModal(false)}
                disabled={submitting}
                className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition disabled:opacity-50"
              >
                Voltar
              </button>
              <button
                type="submit"
                form="timer-finish-form"
                disabled={submitting}
                className="px-4 py-2 rounded-lg bg-focon-600 hover:bg-focon-700 text-white transition disabled:opacity-50"
              >
                {submitting ? 'Salvando...' : 'Confirmar'}
              </button>
            </>
          }
        >
          <form id="timer-finish-form" onSubmit={(e) => { e.preventDefault(); handleConfirmFinish(); }} className="space-y-4">
            {error && (
              <div className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-3">
                <p className="text-sm text-red-800 dark:text-red-400">{error}</p>
              </div>
            )}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Data</label>
                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  {new Date().toLocaleDateString('pt-BR')}
                </p>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Duração calculada</label>
                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  {formatTime(elapsed)} ({Math.max(1, Math.round(elapsed / 60))} min)
                </p>
              </div>
            </div>
            <div>
              <label htmlFor="timer-finish-desc" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Descrição *
              </label>
              <textarea
                id="timer-finish-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                minLength={10}
                maxLength={500}
                required
                placeholder="Descreva o trabalho realizado (mínimo 10 caracteres)..."
                className="w-full px-3 py-2.5 border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-focon-600"
              />
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
