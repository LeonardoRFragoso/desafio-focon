import { useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { supabase } from '@/lib/supabase/client';
import { timeEntriesAPI, projectPhasesAPI, projectTasksAPI } from '@/lib/supabase/api';
import { useAuthContext } from '@/features/auth/useAuthContext';
import { mapDatabaseError } from '@/lib/errors';
import { Modal } from '@/components/Modal';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Pagination } from '@/components/Pagination';
import { useDebounce } from '@/hooks/usePagination';
import { TimeEntryDetailsModal, type TimeEntryDetail } from '@/features/time-entries/TimeEntryDetailsModal';
import { timeEntrySchema, type TimeEntryInput } from '@/schemas/time-entry';

const PAGE_SIZE = 20;

type TimeEntry = TimeEntryDetail;

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
}

type DialogState =
  | { kind: 'details'; entry: TimeEntry }
  | { kind: 'edit'; entry: TimeEntry }
  | { kind: 'duplicate'; entry: TimeEntry }
  | { kind: 'delete'; entry: TimeEntry }
  | null;

export function TimeEntryList() {
  const { user, isAdmin } = useAuthContext();
  const [searchParams, setSearchParams] = useSearchParams();
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [projects, setProjects] = useState<Project[]>([]);
  const [phases, setPhases] = useState<Phase[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<DialogState>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [projectFilter, setProjectFilter] = useState('');
  const [phaseFilter, setPhaseFilter] = useState('');
  const [taskFilter, setTaskFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [page, setPage] = useState(1);
  const debouncedSearch = useDebounce(search, 300);

  const fetchEntries = useCallback(async () => {
    if (!user) return;
    try {
      setLoading(true);
      setError(null);
      const params: Parameters<typeof timeEntriesAPI.queryUserEntries>[0] = {
        userId: user.id,
        page,
        pageSize: PAGE_SIZE,
      };
      if (debouncedSearch) params.search = debouncedSearch;
      if (projectFilter) params.projectId = projectFilter;
      if (phaseFilter) params.phaseId = phaseFilter;
      if (taskFilter) params.taskId = taskFilter;
      if (statusFilter) params.status = statusFilter;
      if (startDate) params.startDate = startDate;
      if (endDate) params.endDate = endDate;
      const { data, error: err, count } = await timeEntriesAPI.queryUserEntries(params);
      if (err) throw err;
      setEntries((data as TimeEntry[]) || []);
      setTotal(count || 0);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao carregar apontamentos';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [user, debouncedSearch, projectFilter, phaseFilter, taskFilter, statusFilter, startDate, endDate, page]);

  const fetchProjects = useCallback(async () => {
    try {
      const { data, error: err } = await supabase
        .from('projects')
        .select('id, name')
        .in('status', ['active', 'planned'])
        .order('name');
      if (err) throw err;
      setProjects((data as Project[]) || []);
    } catch {
      setProjects([]);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchEntries();
    fetchProjects();
  }, [fetchEntries, fetchProjects]);

  // Fetch phases/tasks when project filter changes
  useEffect(() => {
    if (!projectFilter) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPhases([]);
      setTasks([]);
      return;
    }
    projectPhasesAPI.listByProject(projectFilter).then(({ data }) => {
      if (data) setPhases(data as Phase[]);
    });
    projectTasksAPI.listByProject(projectFilter).then(({ data }) => {
      if (data) setTasks((data as Task[]) || []);
    });
  }, [projectFilter]);

  // Reset page when filters change
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPage(1);
  }, [debouncedSearch, projectFilter, phaseFilter, taskFilter, statusFilter, startDate, endDate]);

  // Deep-link: open entry from URL param
  useEffect(() => {
    const entryId = searchParams.get('entry');
    if (entryId && user) {
      timeEntriesAPI.getById(entryId).then(({ data }) => {
        if (data) {
          setDialog({ kind: 'details', entry: data as TimeEntry });
        }
      });
    }
  }, [searchParams, user]);

  const formatDuration = (minutes: number) => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours === 0) return `${mins}m`;
    if (mins === 0) return `${hours}h`;
    return `${hours}h ${mins}m`;
  };

  const formatDate = (date: string) => new Date(date).toLocaleDateString('pt-BR');

  const getStatusBadge = (status: TimeEntry['approval_status']) => {
    const styles: Record<string, string> = {
      pending: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
      approved: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
      rejected: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
    };
    const labels: Record<string, string> = {
      pending: 'Pendente',
      approved: 'Aprovado',
      rejected: 'Rejeitado',
    };
    return (
      <span
        className={`inline-block px-3 py-1 rounded-full text-xs font-semibold ${styles[status] || styles['pending']}`}
      >
        {labels[status] || status}
      </span>
    );
  };

  const canEditOrDelete = (status: TimeEntry['approval_status']) => status === 'pending';

  const handleClearFilters = () => {
    setSearch('');
    setProjectFilter('');
    setPhaseFilter('');
    setTaskFilter('');
    setStatusFilter('');
    setStartDate('');
    setEndDate('');
    setPage(1);
  };

  if (loading && entries.length === 0) {
    return (
      <div className="flex justify-center items-center py-12" role="status" aria-live="polite">
        <div className="flex flex-col items-center gap-3">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-focon-600"></div>
          <p className="text-sm text-slate-600 dark:text-slate-400">Carregando apontamentos...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-4" role="alert">
        <p className="text-sm font-medium text-red-800 dark:text-red-400 mb-3">{error}</p>
        <button
          onClick={fetchEntries}
          className="text-sm font-medium text-red-700 dark:text-red-300 hover:text-red-800 dark:hover:text-red-200 underline"
        >
          Tentar novamente
        </button>
      </div>
    );
  }

  if (entries.length === 0 && !loading) {
    return (
      <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-12 text-center bg-slate-50 dark:bg-slate-800/50">
        <p className="text-slate-600 dark:text-slate-300 mb-2">Nenhum apontamento encontrado</p>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          {search || projectFilter || statusFilter || startDate || endDate
            ? 'Tente ajustar os filtros de busca.'
            : 'Registre suas horas usando o formulário acima.'}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {actionError && (
        <div className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-3" role="alert">
          <p className="text-sm text-red-800 dark:text-red-400">{actionError}</p>
        </div>
      )}

      {/* Search and filters */}
      <div className="space-y-2">
        <div className="flex flex-wrap gap-2">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por descrição ou projeto..."
            className="flex-1 min-w-[180px] px-3 py-2 border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-focon-600"
            aria-label="Busca textual"
          />
          <select
            value={projectFilter}
            onChange={(e) => { setProjectFilter(e.target.value); setPhaseFilter(''); setTaskFilter(''); }}
            className="px-3 py-2 border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-focon-600"
            aria-label="Filtrar por projeto"
          >
            <option value="">Todos os projetos</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-focon-600"
            aria-label="Filtrar por status"
          >
            <option value="">Todos os status</option>
            <option value="pending">Pendente</option>
            <option value="approved">Aprovado</option>
            <option value="rejected">Rejeitado</option>
          </select>
        </div>
        <div className="flex flex-wrap gap-2">
          {projectFilter && (
            <select
              value={phaseFilter}
              onChange={(e) => setPhaseFilter(e.target.value)}
              className="px-3 py-2 border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-focon-600"
              aria-label="Filtrar por fase"
            >
              <option value="">Todas as fases</option>
              {phases.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          )}
          {projectFilter && (
            <select
              value={taskFilter}
              onChange={(e) => setTaskFilter(e.target.value)}
              className="px-3 py-2 border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-focon-600"
              aria-label="Filtrar por tarefa"
            >
              <option value="">Todas as tarefas</option>
              {tasks.map((t) => (
                <option key={t.id} value={t.id}>{t.title}</option>
              ))}
            </select>
          )}
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="px-3 py-2 border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-focon-600"
            aria-label="Data inicial"
          />
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="px-3 py-2 border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-focon-600"
            aria-label="Data final"
          />
          {(search || projectFilter || phaseFilter || taskFilter || statusFilter || startDate || endDate) && (
            <button
              onClick={handleClearFilters}
              className="px-3 py-2 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 rounded-lg text-sm hover:bg-slate-100 dark:hover:bg-slate-800 transition"
            >
              Limpar filtros
            </button>
          )}
        </div>
      </div>

      <p className="text-sm text-slate-500 dark:text-slate-400">
        {total} apontamento{total !== 1 ? 's' : ''}
      </p>

      <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
        <table className="w-full">
          <caption className="sr-only">Histórico de apontamentos de horas</caption>
          <thead>
            <tr className="border-b border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800">
              <th className="px-4 py-3 text-left text-sm font-semibold text-slate-900 dark:text-slate-100" scope="col">Projeto</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-slate-900 dark:text-slate-100" scope="col">Fase</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-slate-900 dark:text-slate-100" scope="col">Tarefa</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-slate-900 dark:text-slate-100" scope="col">Data</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-slate-900 dark:text-slate-100" scope="col">Duração</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-slate-900 dark:text-slate-100" scope="col">Descrição</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-slate-900 dark:text-slate-100" scope="col">Status</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-slate-900 dark:text-slate-100" scope="col">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
            {entries.map((entry) => {
              const editable = canEditOrDelete(entry.approval_status);
              return (
                <tr
                  key={entry.id}
                  onClick={() => setDialog({ kind: 'details', entry })}
                  className="hover:bg-slate-50 dark:hover:bg-slate-800 transition cursor-pointer"
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') setDialog({ kind: 'details', entry });
                  }}
                >
                  <td className="px-4 py-3 text-sm text-slate-900 dark:text-slate-100">{entry.project?.name || '—'}</td>
                  <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-400">{entry.phase?.name || '—'}</td>
                  <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-400">{entry.task?.title || '—'}</td>
                  <td className="px-4 py-3 text-sm text-slate-900 dark:text-slate-100 whitespace-nowrap">{formatDate(entry.entry_date)}</td>
                  <td className="px-4 py-3 text-sm text-slate-900 dark:text-slate-100 whitespace-nowrap">{formatDuration(entry.duration_minutes)}</td>
                  <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-400 min-w-[200px] max-w-[320px] truncate">
                    {entry.description}
                  </td>
                  <td className="px-4 py-3 text-sm">{getStatusBadge(entry.approval_status)}</td>
                  <td className="px-4 py-3 text-sm" onClick={(e) => e.stopPropagation()}>
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        onClick={() => setDialog({ kind: 'edit', entry })}
                        disabled={!editable}
                        className="px-2.5 py-1 rounded-md text-xs font-medium border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition disabled:opacity-40 disabled:cursor-not-allowed"
                        aria-disabled={!editable}
                        title={editable ? 'Editar apontamento' : 'Edição indisponível (não pendente)'}
                      >
                        Editar
                      </button>
                      <button
                        onClick={() => setDialog({ kind: 'delete', entry })}
                        disabled={!editable}
                        className="px-2.5 py-1 rounded-md text-xs font-medium border border-red-300 dark:border-red-700 text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition disabled:opacity-40 disabled:cursor-not-allowed"
                        aria-disabled={!editable}
                        title={editable ? 'Excluir apontamento' : 'Exclusão indisponível (não pendente)'}
                      >
                        Excluir
                      </button>
                      <button
                        onClick={() => setDialog({ kind: 'duplicate', entry })}
                        className="px-2.5 py-1 rounded-md text-xs font-medium border border-focon-300 dark:border-focon-700 text-focon-700 dark:text-focon-400 hover:bg-focon-50 dark:hover:bg-focon-900/20 transition"
                        title={entry.approval_status === 'rejected' ? 'Corrigir criando novo apontamento' : 'Duplicar apontamento'}
                      >
                        {entry.approval_status === 'rejected' ? 'Corrigir' : 'Duplicar'}
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <Pagination
        page={page}
        pageSize={PAGE_SIZE}
        total={total}
        onPageChange={setPage}
      />

      {dialog?.kind === 'details' && (
        <TimeEntryDetailsModal
          entry={dialog.entry}
          isOpen={true}
          onClose={() => {
            setDialog(null);
            // Remove entry param from URL
            const params = new URLSearchParams(searchParams);
            params.delete('entry');
            setSearchParams(params, { replace: true });
          }}
          isAdmin={isAdmin}
        />
      )}

      {dialog?.kind === 'edit' && (
        <EditEntryModal
          entry={dialog.entry}
          projects={projects}
          onClose={() => setDialog(null)}
          onSaved={() => {
            setDialog(null);
            fetchEntries();
          }}
          onError={(msg) => setActionError(msg)}
        />
      )}

      {dialog?.kind === 'duplicate' && (
        <DuplicateEntryModal
          entry={dialog.entry}
          projects={projects}
          onClose={() => setDialog(null)}
          onSaved={() => {
            setDialog(null);
            fetchEntries();
          }}
          onError={(msg) => setActionError(msg)}
        />
      )}

      {dialog?.kind === 'delete' && (
        <ConfirmDialog
          open
          title="Excluir apontamento"
          destructive
          confirmLabel="Excluir"
          onClose={() => setDialog(null)}
          onConfirm={async () => {
            if (!user) return;
            const { error: err } = await timeEntriesAPI.delete(dialog.entry.id);
            if (err) {
              setActionError(mapDatabaseError(err));
              return;
            }
            setDialog(null);
            fetchEntries();
          }}
          message={
            <>
              <p className="text-sm text-slate-700 dark:text-slate-300">
                Tem certeza que deseja excluir este apontamento?
              </p>
              <p className="mt-2 text-sm text-slate-900 dark:text-slate-100 font-medium">
                {dialog.entry.project?.name} — {formatDate(dialog.entry.entry_date)} —{' '}
                {formatDuration(dialog.entry.duration_minutes)}
              </p>
              <p className="mt-3 text-red-700 dark:text-red-400">
                Esta operação não poderá ser desfeita.
              </p>
            </>
          }
        />
      )}
    </div>
  );
}

interface EditEntryModalProps {
  entry: TimeEntry;
  projects: Project[];
  onClose: () => void;
  onSaved: () => void;
  onError: (msg: string) => void;
}

function EditEntryModal({ entry, projects, onClose, onSaved, onError }: EditEntryModalProps) {
  const [submitting, setSubmitting] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<TimeEntryInput>({
    resolver: zodResolver(timeEntrySchema),
    defaultValues: {
      projectId: entry.project_id,
      entryDate: entry.entry_date,
      durationMinutes: entry.duration_minutes,
      description: entry.description,
    },
  });

  const onSubmit = async (data: TimeEntryInput) => {
    setSubmitting(true);
    try {
      const { error: err } = await timeEntriesAPI.update(entry.id, {
        project_id: data.projectId,
        entry_date: data.entryDate,
        duration_minutes: data.durationMinutes,
        description: data.description,
      });
      if (err) throw err;
      onSaved();
    } catch (err) {
      onError(err instanceof Error ? mapDatabaseError(err) : 'Erro ao atualizar apontamento');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Editar Apontamento"
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
            form="edit-entry-form"
            disabled={submitting}
            className="px-4 py-2 rounded-lg bg-focon-600 hover:bg-focon-700 text-white transition disabled:opacity-50"
          >
            {submitting ? 'Salvando...' : 'Salvar'}
          </button>
        </>
      }
    >
      <form id="edit-entry-form" onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div>
          <label htmlFor="edit-projectId" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
            Projeto *
          </label>
          <select
            {...register('projectId')}
            id="edit-projectId"
            className="w-full px-3 py-2.5 border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-focon-600"
          >
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          {errors.projectId && <p className="mt-1 text-sm text-red-600">{errors.projectId.message}</p>}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="edit-entryDate" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Data *
            </label>
            <input
              {...register('entryDate')}
              id="edit-entryDate"
              type="date"
              className="w-full px-3 py-2.5 border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-focon-600"
            />
            {errors.entryDate && <p className="mt-1 text-sm text-red-600">{errors.entryDate.message}</p>}
          </div>
          <div>
            <label htmlFor="edit-durationMinutes" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Duração (minutos) *
            </label>
            <input
              {...register('durationMinutes', { valueAsNumber: true })}
              id="edit-durationMinutes"
              type="number"
              min="1"
              max="1440"
              className="w-full px-3 py-2.5 border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-focon-600"
            />
            {errors.durationMinutes && (
              <p className="mt-1 text-sm text-red-600">{errors.durationMinutes.message}</p>
            )}
          </div>
        </div>
        <div>
          <label htmlFor="edit-description" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
            Descrição *
          </label>
          <textarea
            {...register('description')}
            id="edit-description"
            rows={3}
            className="w-full px-3 py-2.5 border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-focon-600"
          />
          {errors.description && <p className="mt-1 text-sm text-red-600">{errors.description.message}</p>}
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Apenas apontamentos pendentes podem ser editados. O valor/hora é recalculado
          automaticamente pelo sistema ao alterar a data.
        </p>
      </form>
    </Modal>
  );
}

interface DuplicateEntryModalProps {
  entry: TimeEntry;
  projects: Project[];
  onClose: () => void;
  onSaved: () => void;
  onError: (msg: string) => void;
}

function DuplicateEntryModal({ entry, projects, onClose, onSaved, onError }: DuplicateEntryModalProps) {
  const { user } = useAuthContext();
  const [submitting, setSubmitting] = useState(false);
  const today = new Date().toISOString().slice(0, 10);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<TimeEntryInput>({
    resolver: zodResolver(timeEntrySchema),
    defaultValues: {
      projectId: entry.project_id,
      entryDate: today,
      durationMinutes: entry.duration_minutes,
      description: entry.description,
    },
  });

  const onSubmit = async (data: TimeEntryInput) => {
    if (!user) return;
    setSubmitting(true);
    try {
      const { error: err } = await timeEntriesAPI.duplicate({
        project_id: data.projectId,
        professional_id: user.id,
        duration_minutes: data.durationMinutes,
        description: data.description,
        entry_date: data.entryDate,
      });
      if (err) throw err;
      onSaved();
    } catch (err) {
      onError(err instanceof Error ? mapDatabaseError(err) : 'Erro ao duplicar apontamento');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={entry.approval_status === 'rejected' ? 'Corrigir Apontamento' : 'Duplicar Apontamento'}
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
            form="duplicate-entry-form"
            disabled={submitting}
            className="px-4 py-2 rounded-lg bg-focon-600 hover:bg-focon-700 text-white transition disabled:opacity-50"
          >
            {submitting ? 'Criando...' : 'Criar'}
          </button>
        </>
      }
    >
      <form id="duplicate-entry-form" onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Um novo apontamento <strong>pendente</strong> será criado copiando projeto, duração e
          descrição. A data pode ser ajustada abaixo. O valor/hora será definido pelo sistema.
        </p>
        <div>
          <label htmlFor="dup-projectId" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
            Projeto *
          </label>
          <select
            {...register('projectId')}
            id="dup-projectId"
            className="w-full px-3 py-2.5 border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-focon-600"
          >
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          {errors.projectId && <p className="mt-1 text-sm text-red-600">{errors.projectId.message}</p>}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="dup-entryDate" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Nova data *
            </label>
            <input
              {...register('entryDate')}
              id="dup-entryDate"
              type="date"
              className="w-full px-3 py-2.5 border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-focon-600"
            />
            {errors.entryDate && <p className="mt-1 text-sm text-red-600">{errors.entryDate.message}</p>}
          </div>
          <div>
            <label htmlFor="dup-durationMinutes" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Duração (minutos) *
            </label>
            <input
              {...register('durationMinutes', { valueAsNumber: true })}
              id="dup-durationMinutes"
              type="number"
              min="1"
              max="1440"
              className="w-full px-3 py-2.5 border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-focon-600"
            />
            {errors.durationMinutes && (
              <p className="mt-1 text-sm text-red-600">{errors.durationMinutes.message}</p>
            )}
          </div>
        </div>
        <div>
          <label htmlFor="dup-description" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
            Descrição *
          </label>
          <textarea
            {...register('description')}
            id="dup-description"
            rows={3}
            className="w-full px-3 py-2.5 border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-focon-600"
          />
          {errors.description && <p className="mt-1 text-sm text-red-600">{errors.description.message}</p>}
        </div>
      </form>
    </Modal>
  );
}
