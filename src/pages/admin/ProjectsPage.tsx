import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { projectsAPI } from '@/lib/supabase/api';
import { mapDatabaseError } from '@/lib/errors';
import { Modal } from '@/components/Modal';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { useDebounce } from '@/hooks/usePagination';
import type { Project, ProjectStatus } from '@/types/database';

interface ProjectWithTeam extends Project {
  project_members?: { count: number }[];
}

export function ProjectsPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [projects, setProjects] = useState<ProjectWithTeam[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editTarget, setEditTarget] = useState<Project | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Project | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [teamFilter, setTeamFilter] = useState(searchParams.get('team') ?? '');
  const debouncedSearch = useDebounce(search, 300);

  const fetchProjects = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const { data, error: err } = await projectsAPI.listWithTeamInfo();
      if (err) throw err;
      setProjects((data as ProjectWithTeam[]) || []);
    } catch (err) {
      setError(err instanceof Error ? mapDatabaseError(err) : 'Erro ao carregar projetos');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchProjects();
  }, [fetchProjects]);

  // Sync teamFilter to URL
  useEffect(() => {
    const params = new URLSearchParams(searchParams);
    if (teamFilter) {
      params.set('team', teamFilter);
    } else {
      params.delete('team');
    }
    setSearchParams(params, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamFilter]);

  const statusLabels: Record<string, string> = {
    planned: 'Planejado',
    active: 'Ativo',
    completed: 'Concluído',
    cancelled: 'Cancelado',
  };

  const statusColors: Record<string, string> = {
    planned: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
    active: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
    completed: 'bg-slate-100 text-slate-800 bg-surface-secondary text-app-secondary',
    cancelled: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  };

  const formatDate = (d: string) => new Date(d).toLocaleDateString('pt-BR');

  const filteredProjects = useMemo(() => {
    let result = projects;
    if (debouncedSearch) {
      const q = debouncedSearch.toLowerCase();
      result = result.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          (p.client ?? '').toLowerCase().includes(q)
      );
    }
    if (statusFilter) {
      result = result.filter((p) => p.status === statusFilter);
    }
    if (teamFilter === 'unassigned') {
      result = result.filter(
        (p) => (p.project_members?.[0]?.count ?? 0) === 0 && (p.status === 'active' || p.status === 'planned')
      );
    }
    return result;
  }, [projects, debouncedSearch, statusFilter, teamFilter]);

  const isUnassigned = (p: ProjectWithTeam) => (p.project_members?.[0]?.count ?? 0) === 0;

  if (loading) {
    return (
      <div className="flex justify-center items-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-focon-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-app-primary">Projetos</h2>
          <p className="text-app-muted">Gerencie os projetos da empresa</p>
        </div>
        <button
          onClick={() => setCreateOpen(true)}
          className="px-4 py-2 bg-focon-600 hover:bg-focon-700 text-white rounded-lg font-medium transition"
        >
          Novo Projeto
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

      {/* Search and filter */}
      <div className="flex flex-wrap gap-2">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nome ou cliente..."
          className="flex-1 min-w-[180px] px-3 py-2 border border-app-strong bg-surface-secondary text-app-primary rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-focon-600"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2 border border-app-strong bg-surface-secondary text-app-primary rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-focon-600"
        >
          <option value="">Todos os status</option>
          <option value="planned">Planejado</option>
          <option value="active">Ativo</option>
          <option value="completed">Concluído</option>
          <option value="cancelled">Cancelado</option>
        </select>
        <select
          value={teamFilter}
          onChange={(e) => setTeamFilter(e.target.value)}
          className="px-3 py-2 border border-app-strong bg-surface-secondary text-app-primary rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-focon-600"
          aria-label="Filtrar por equipe"
        >
          <option value="">Todos os projetos</option>
          <option value="unassigned">Sem equipe alocada</option>
        </select>
      </div>

      {teamFilter === 'unassigned' && (
        <div className="rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 p-3">
          <p className="text-sm text-amber-800 dark:text-amber-400">
            Mostrando apenas projetos ativos/planejados sem membros da equipe alocados.
            Use o botão <strong>"Alocar Equipe"</strong> para navegar ao workspace do projeto e adicionar membros.
          </p>
        </div>
      )}

      {projects.length === 0 ? (
        <div className="rounded-xl border border-app-primary p-12 text-center bg-surface-secondary/50">
          <p className="text-app-muted">Nenhum projeto cadastrado</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-app-primary shadow-sm">
          <table className="w-full">
            <thead className="bg-surface-secondary border-b border-app-primary">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-semibold text-app-primary">Nome</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-app-primary">Cliente</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-app-primary">Status</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-app-primary">Equipe</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-app-primary">Início</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-app-primary">Fim</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-app-primary">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-table-divider">
              {filteredProjects.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-sm text-app-muted">Nenhum projeto encontrado</td></tr>
              ) : (
                filteredProjects.map((p) => (
                <tr
                  key={p.id}
                  onClick={() => navigate(`/projects/${p.id}`)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      navigate(`/projects/${p.id}`);
                    }
                  }}
                  tabIndex={0}
                  role="button"
                  aria-label={`Abrir projeto ${p.name}`}
                  className="hover:bg-hover-surface transition cursor-pointer focus:outline-none focus:ring-2 focus:ring-inset focus:ring-focon-600"
                >
                  <td className="px-4 py-3 text-sm text-app-primary font-medium">{p.name}</td>
                  <td className="px-4 py-3 text-sm text-app-secondary">{p.client}</td>
                  <td className="px-4 py-3 text-sm">
                    <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-semibold ${statusColors[p.status] || statusColors['planned']}`}>
                      {statusLabels[p.status] || p.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm">
                    {isUnassigned(p) ? (
                      <span className="inline-block px-2 py-0.5 rounded text-xs font-semibold bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400">
                        Sem equipe
                      </span>
                    ) : (
                      <span className="text-app-secondary">{p.project_members?.[0]?.count ?? 0} membro(s)</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-app-secondary">{formatDate(p.start_date)}</td>
                  <td className="px-4 py-3 text-sm text-app-secondary">{formatDate(p.end_date)}</td>
                  <td className="px-4 py-3 text-sm space-x-2" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => navigate(`/projects/${p.id}`)}
                      className="px-2.5 py-1 rounded-md text-xs font-medium bg-focon-600 hover:bg-focon-700 text-white transition"
                    >
                      Ver
                    </button>
                    {isUnassigned(p) && (p.status === 'active' || p.status === 'planned') && (
                      <button
                        onClick={() => navigate(`/projects/${p.id}?tab=team`)}
                        className="px-2.5 py-1 rounded-md text-xs font-medium bg-amber-600 hover:bg-amber-700 text-white transition"
                        title="Este projeto não tem equipe alocada"
                      >
                        Alocar Equipe
                      </button>
                    )}
                    <button
                      onClick={() => setEditTarget(p)}
                      className="px-2.5 py-1 rounded-md text-xs font-medium border border-app-strong text-app-secondary hover:bg-hover-surface transition"
                    >
                      Editar
                    </button>
                    <button
                      onClick={() => setDeleteTarget(p)}
                      className="px-2.5 py-1 rounded-md text-xs font-medium border border-red-300 dark:border-red-700 text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition"
                    >
                      Excluir
                    </button>
                  </td>
                </tr>
              ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {createOpen && (
        <ProjectFormModal
          onClose={() => setCreateOpen(false)}
          onSaved={() => {
            setCreateOpen(false);
            fetchProjects();
          }}
          onError={(msg) => setActionError(msg)}
        />
      )}

      {editTarget && (
        <ProjectFormModal
          project={editTarget}
          onClose={() => setEditTarget(null)}
          onSaved={() => {
            setEditTarget(null);
            fetchProjects();
          }}
          onError={(msg) => setActionError(msg)}
        />
      )}

      {deleteTarget && (
        <ConfirmDialog
          open
          title="Excluir projeto"
          destructive
          confirmLabel="Excluir"
          onClose={() => setDeleteTarget(null)}
          onConfirm={async () => {
            const { error: err } = await projectsAPI.remove(deleteTarget.id);
            if (err) {
              setActionError(mapDatabaseError(err));
              return;
            }
            await fetchProjects();
          }}
          message={
            <>
              <p>Tem certeza que deseja excluir o projeto <strong>{deleteTarget.name}</strong>?</p>
              <p className="mt-2 text-red-700 dark:text-red-400">Apontamentos associados podem ser afetados.</p>
            </>
          }
        />
      )}
    </div>
  );
}

interface ProjectFormModalProps {
  project?: ProjectWithTeam;
  onClose: () => void;
  onSaved: () => void;
  onError: (msg: string) => void;
}

function ProjectFormModal({ project, onClose, onSaved, onError }: ProjectFormModalProps) {
  const navigate = useNavigate();
  const [name, setName] = useState(project?.name ?? '');
  const [client, setClient] = useState(project?.client ?? '');
  const [status, setStatus] = useState<ProjectStatus>((project?.status as ProjectStatus) ?? 'active');
  const [startDate, setStartDate] = useState(project?.start_date ?? new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState(project?.end_date ?? '');
  const [submitting, setSubmitting] = useState(false);
  const memberCount = project?.project_members?.[0]?.count ?? 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !client.trim() || !startDate || !endDate) {
      onError('Preencha todos os campos obrigatórios.');
      return;
    }
    setSubmitting(true);
    try {
      const data = { name: name.trim(), client: client.trim(), status, start_date: startDate, end_date: endDate };
      const { error: err } = project
        ? await projectsAPI.update(project.id, data)
        : await projectsAPI.create(data);
      if (err) throw err;
      onSaved();
    } catch (err) {
      onError(err instanceof Error ? mapDatabaseError(err) : 'Erro ao salvar projeto');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={project ? 'Editar Projeto' : 'Novo Projeto'}
      footer={
        <>
          <button type="button" onClick={onClose} disabled={submitting} className="px-4 py-2 rounded-lg border border-app-strong text-app-secondary hover:bg-hover-surface transition disabled:opacity-50">
            Cancelar
          </button>
          <button type="submit" form="project-form" disabled={submitting} className="px-4 py-2 rounded-lg bg-focon-600 hover:bg-focon-700 text-white transition disabled:opacity-50">
            {submitting ? 'Salvando...' : 'Salvar'}
          </button>
        </>
      }
    >
      <form id="project-form" onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-app-secondary mb-1">Nome *</label>
          <input value={name} onChange={(e) => setName(e.target.value)} className="w-full px-3 py-2.5 border border-app-strong bg-surface-secondary text-app-primary rounded-lg focus:outline-none focus:ring-2 focus:ring-focon-600" />
        </div>
        <div>
          <label className="block text-sm font-medium text-app-secondary mb-1">Cliente *</label>
          <input value={client} onChange={(e) => setClient(e.target.value)} className="w-full px-3 py-2.5 border border-app-strong bg-surface-secondary text-app-primary rounded-lg focus:outline-none focus:ring-2 focus:ring-focon-600" />
        </div>
        <div>
          <label className="block text-sm font-medium text-app-secondary mb-1">Status *</label>
          <select value={status} onChange={(e) => setStatus(e.target.value as ProjectStatus)} className="w-full px-3 py-2.5 border border-app-strong bg-surface-secondary text-app-primary rounded-lg focus:outline-none focus:ring-2 focus:ring-focon-600">
            <option value="planned">Planejado</option>
            <option value="active">Ativo</option>
            <option value="completed">Concluído</option>
            <option value="cancelled">Cancelado</option>
          </select>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-app-secondary mb-1">Início *</label>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-full px-3 py-2.5 border border-app-strong bg-surface-secondary text-app-primary rounded-lg focus:outline-none focus:ring-2 focus:ring-focon-600" />
          </div>
          <div>
            <label className="block text-sm font-medium text-app-secondary mb-1">Fim *</label>
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-full px-3 py-2.5 border border-app-strong bg-surface-secondary text-app-primary rounded-lg focus:outline-none focus:ring-2 focus:ring-focon-600" />
          </div>
        </div>

        {project && (
          <div className="rounded-lg border border-app-primary p-4 bg-surface-secondary/50">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-app-secondary">Equipe do projeto</p>
                <p className="text-sm text-app-muted mt-0.5">
                  {memberCount === 0
                    ? 'Nenhum membro alocado neste projeto'
                    : `${memberCount} membro(s) alocado(s)`}
                </p>
              </div>
              <button
                type="button"
                onClick={() => navigate(`/projects/${project.id}?tab=team`)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium border border-app-strong text-app-secondary hover:bg-hover-surface transition"
              >
                {memberCount === 0 ? 'Alocar equipe' : 'Gerenciar equipe'}
              </button>
            </div>
            {memberCount === 0 && (status === 'active' || status === 'planned') && (
              <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">
                ⚠ Projetos ativos/planejados sem equipe alocada aparecem como pendência na Central de Ações.
              </p>
            )}
          </div>
        )}
      </form>
    </Modal>
  );
}
