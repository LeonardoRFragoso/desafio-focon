import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '@/lib/supabase/client';
import { timeEntriesAPI, projectPhasesAPI, projectTasksAPI } from '@/lib/supabase/api';
import { mapDatabaseError } from '@/lib/errors';
import { useAuthContext } from '@/features/auth/useAuthContext';
import { Pagination } from '@/components/Pagination';
import { useDebounce } from '@/hooks/usePagination';
import { TimeEntryDetailsModal, type TimeEntryDetail } from '@/features/time-entries/TimeEntryDetailsModal';

const PAGE_SIZE = 20;

interface Project { id: string; name: string; }
interface Phase { id: string; name: string; }
interface Task { id: string; title: string; }
interface Professional { id: string; full_name: string; }

type AdminEntry = TimeEntryDetail;

export function AdminTimeEntriesPage() {
  const { isAdmin } = useAuthContext();
  const [searchParams, setSearchParams] = useSearchParams();
  const [entries, setEntries] = useState<AdminEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [professionalFilter, setProfessionalFilter] = useState('');
  const [projectFilter, setProjectFilter] = useState('');
  const [phaseFilter, setPhaseFilter] = useState('');
  const [taskFilter, setTaskFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [projects, setProjects] = useState<Project[]>([]);
  const [professionals, setProfessionals] = useState<Professional[]>([]);
  const [phases, setPhases] = useState<Phase[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [selectedEntry, setSelectedEntry] = useState<AdminEntry | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const debouncedSearch = useDebounce(search, 300);

  // Sync filters from URL
  useEffect(() => {
    const urlStatus = searchParams.get('status');
    const urlProject = searchParams.get('project');
    const urlProf = searchParams.get('professional');
    const urlPage = searchParams.get('page');
    const urlEntry = searchParams.get('entry');
    if (urlStatus) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setStatusFilter(urlStatus);
    }
    if (urlProject) {
      setProjectFilter(urlProject);
    }
    if (urlProf) {
      setProfessionalFilter(urlProf);
    }
    if (urlPage) {
      setPage(Number(urlPage));
    }
    // Deep-link: open specific entry
    if (urlEntry) {
      timeEntriesAPI.getById(urlEntry).then(({ data }) => {
        if (data) setSelectedEntry(data as AdminEntry);
      });
    }
  }, [searchParams]);

  // Fetch metadata
  useEffect(() => {
    supabase.from('projects').select('id, name').order('name').then(({ data }) => {
      if (data) setProjects(data as Project[]);
    });
    supabase.from('profiles').select('id, full_name').order('full_name').then(({ data }) => {
      if (data) setProfessionals(data as Professional[]);
    });
  }, []);

  // Fetch phases/tasks when project changes
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

  const fetchEntries = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const params: Parameters<typeof timeEntriesAPI.queryAllEntries>[0] = {
        page,
        pageSize: PAGE_SIZE,
      };
      if (debouncedSearch) params.search = debouncedSearch;
      if (professionalFilter) params.professionalId = professionalFilter;
      if (projectFilter) params.projectId = projectFilter;
      if (phaseFilter) params.phaseId = phaseFilter;
      if (taskFilter) params.taskId = taskFilter;
      if (statusFilter) params.status = statusFilter;
      if (startDate) params.startDate = startDate;
      if (endDate) params.endDate = endDate;
      const { data, error: err, count } = await timeEntriesAPI.queryAllEntries(params);
      if (err) throw err;
      setEntries((data as AdminEntry[]) || []);
      setTotal(count || 0);
    } catch (err) {
      setError(err instanceof Error ? mapDatabaseError(err) : 'Erro ao carregar apontamentos');
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, professionalFilter, projectFilter, phaseFilter, taskFilter, statusFilter, startDate, endDate, page]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchEntries();
  }, [fetchEntries]);

  // Update URL when filters change
  useEffect(() => {
    const params = new URLSearchParams();
    if (statusFilter) params.set('status', statusFilter);
    if (projectFilter) params.set('project', projectFilter);
    if (professionalFilter) params.set('professional', professionalFilter);
    if (page > 1) params.set('page', String(page));
    setSearchParams(params, { replace: true });
  }, [statusFilter, projectFilter, professionalFilter, page, setSearchParams]);

  // Reset page when filters change
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPage(1);
  }, [debouncedSearch, professionalFilter, projectFilter, phaseFilter, taskFilter, statusFilter, startDate, endDate]);

  const handleClearFilters = () => {
    setSearch('');
    setProfessionalFilter('');
    setProjectFilter('');
    setPhaseFilter('');
    setTaskFilter('');
    setStatusFilter('');
    setStartDate('');
    setEndDate('');
    setPage(1);
  };

  const formatDate = (d: string) => new Date(d).toLocaleDateString('pt-BR');
  const formatDuration = (m: number) => {
    const h = Math.floor(m / 60);
    const min = m % 60;
    if (h === 0) return `${min}m`;
    if (min === 0) return `${h}h`;
    return `${h}h ${min}m`;
  };

  const handleApprove = async (entryId: string) => {
    const { error: err } = await timeEntriesAPI.approve(entryId);
    if (err) throw err;
    fetchEntries();
  };

  const handleReject = async (entryId: string, reason: string) => {
    const { error: err } = await timeEntriesAPI.reject(entryId, reason);
    if (err) throw err;
    fetchEntries();
  };

  if (!isAdmin) {
    return <div className="p-4 text-center text-slate-500">Acesso negado.</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Histórico de Apontamentos</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Consulta histórica e auditoria operacional de todos os apontamentos.
        </p>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-4" role="alert">
          <p className="text-sm font-medium text-red-800 dark:text-red-400">{error}</p>
        </div>
      )}
      {actionError && (
        <div className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-4" role="alert">
          <p className="text-sm font-medium text-red-800 dark:text-red-400">{actionError}</p>
        </div>
      )}

      {/* Filters */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-surface-primary p-4 shadow-sm space-y-3">
        <div className="flex flex-wrap gap-2">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por profissional, projeto ou descrição..."
            className="flex-1 min-w-[200px] px-3 py-2 border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-focon-600"
            aria-label="Busca textual"
          />
          <select
            value={professionalFilter}
            onChange={(e) => setProfessionalFilter(e.target.value)}
            className="px-3 py-2 border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-focon-600"
            aria-label="Filtrar por profissional"
          >
            <option value="">Todos os profissionais</option>
            {professionals.map((p) => (
              <option key={p.id} value={p.id}>{p.full_name}</option>
            ))}
          </select>
          <select
            value={projectFilter}
            onChange={(e) => setProjectFilter(e.target.value)}
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
          <button
            onClick={handleClearFilters}
            className="px-3 py-2 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 rounded-lg text-sm hover:bg-slate-100 dark:hover:bg-slate-800 transition"
          >
            Limpar filtros
          </button>
        </div>
      </div>

      {/* Results count */}
      <p className="text-sm text-slate-500 dark:text-slate-400">
        {total} apontamento{total !== 1 ? 's' : ''} encontrado{total !== 1 ? 's' : ''}
      </p>

      {/* Table (desktop) / Cards (mobile) */}
      {loading ? (
        <div className="flex justify-center items-center py-12" role="status" aria-live="polite">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-focon-600"></div>
        </div>
      ) : entries.length === 0 ? (
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-12 text-center bg-slate-50 dark:bg-slate-800/50">
          <p className="text-slate-600 dark:text-slate-400">Nenhum apontamento encontrado</p>
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden md:block overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
            <table className="w-full">
              <caption className="sr-only">Histórico de apontamentos</caption>
              <thead className="bg-slate-100 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
                <tr>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-slate-900 dark:text-slate-100" scope="col">Profissional</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-slate-900 dark:text-slate-100" scope="col">Projeto</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-slate-900 dark:text-slate-100" scope="col">Fase</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-slate-900 dark:text-slate-100" scope="col">Tarefa</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-slate-900 dark:text-slate-100" scope="col">Data</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-slate-900 dark:text-slate-100" scope="col">Duração</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-slate-900 dark:text-slate-100" scope="col">Status</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-slate-900 dark:text-slate-100" scope="col">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                {entries.map((entry) => (
                  <tr key={entry.id} className="hover:bg-slate-50 dark:hover:bg-slate-800 transition">
                    <td className="px-4 py-3 text-sm text-slate-900 dark:text-slate-100">{entry.professional?.full_name || '—'}</td>
                    <td className="px-4 py-3 text-sm text-slate-700 dark:text-slate-300">{entry.project?.name || '—'}</td>
                    <td className="px-4 py-3 text-sm text-slate-700 dark:text-slate-300">{entry.phase?.name || '—'}</td>
                    <td className="px-4 py-3 text-sm text-slate-700 dark:text-slate-300">{entry.task?.title || '—'}</td>
                    <td className="px-4 py-3 text-sm text-slate-700 dark:text-slate-300 whitespace-nowrap">{formatDate(entry.entry_date)}</td>
                    <td className="px-4 py-3 text-sm text-slate-700 dark:text-slate-300 whitespace-nowrap">{formatDuration(entry.duration_minutes)}</td>
                    <td className="px-4 py-3 text-sm">
                      <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-semibold ${
                        entry.approval_status === 'approved'
                          ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                          : entry.approval_status === 'pending'
                            ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400'
                            : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
                      }`}>
                        {entry.approval_status === 'approved' ? 'Aprovado' : entry.approval_status === 'pending' ? 'Pendente' : 'Rejeitado'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm space-x-2">
                      <button
                        onClick={() => setSelectedEntry(entry)}
                        className="px-2.5 py-1 rounded-md text-xs font-medium border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                      >
                        Ver detalhes
                      </button>
                      {entry.approval_status === 'pending' && (
                        <>
                          <button
                            onClick={async () => {
                              try {
                                await handleApprove(entry.id);
                              } catch (err) {
                                setActionError(err instanceof Error ? mapDatabaseError(err) : 'Erro ao aprovar');
                              }
                            }}
                            className="px-2.5 py-1 rounded-md text-xs font-medium bg-green-600 hover:bg-green-700 text-white transition"
                          >
                            Aprovar
                          </button>
                          <button
                            onClick={() => setSelectedEntry(entry)}
                            className="px-2.5 py-1 rounded-md text-xs font-medium border border-red-300 dark:border-red-700 text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition"
                          >
                            Rejeitar
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden space-y-3">
            {entries.map((entry) => (
              <div
                key={entry.id}
                className="rounded-xl border border-slate-200 dark:border-slate-700 bg-surface-primary p-4 shadow-sm"
              >
                <div className="flex justify-between items-start mb-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {entry.professional?.full_name || '—'}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {entry.project?.name || '—'} · {formatDate(entry.entry_date)} · {formatDuration(entry.duration_minutes)}
                    </p>
                  </div>
                  <span className={`shrink-0 ml-2 inline-block px-2.5 py-1 rounded-full text-xs font-semibold ${
                    entry.approval_status === 'approved'
                      ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                      : entry.approval_status === 'pending'
                        ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400'
                        : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
                  }`}>
                    {entry.approval_status === 'approved' ? 'Aprovado' : entry.approval_status === 'pending' ? 'Pendente' : 'Rejeitado'}
                  </span>
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-400 line-clamp-2 mb-3">{entry.description}</p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setSelectedEntry(entry)}
                    className="flex-1 px-3 py-1.5 rounded-lg text-xs font-medium border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                  >
                    Ver detalhes
                  </button>
                  {entry.approval_status === 'pending' && (
                    <button
                      onClick={async () => {
                        try {
                          await handleApprove(entry.id);
                        } catch (err) {
                          setActionError(err instanceof Error ? mapDatabaseError(err) : 'Erro ao aprovar');
                        }
                      }}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium bg-green-600 hover:bg-green-700 text-white transition"
                    >
                      Aprovar
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Pagination */}
          <Pagination
            page={page}
            pageSize={PAGE_SIZE}
            total={total}
            onPageChange={setPage}
          />
        </>
      )}

      {/* Details Modal */}
      {selectedEntry && (
        <TimeEntryDetailsModal
          entry={selectedEntry}
          isOpen={true}
          onClose={() => {
            setSelectedEntry(null);
            // Remove entry param from URL
            const params = new URLSearchParams(searchParams);
            params.delete('entry');
            setSearchParams(params, { replace: true });
          }}
          isAdmin={isAdmin}
          onApprove={handleApprove}
          onReject={handleReject}
        />
      )}
    </div>
  );
}
