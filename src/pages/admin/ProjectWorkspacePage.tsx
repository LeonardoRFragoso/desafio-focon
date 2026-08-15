import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { projectsAPI, projectWorkspaceAPI } from '@/lib/supabase/api';
import { mapDatabaseError } from '@/lib/errors';
import { useAuthContext } from '@/features/auth/useAuthContext';
import type { Project, ProjectWorkspaceSummary } from '@/types/database';
import { ProjectOverview } from '@/features/project-workspace/ProjectOverview';
import { ProjectTasksTab } from '@/features/project-workspace/ProjectTasksTab';
import { ProjectPhasesTab } from '@/features/project-workspace/ProjectPhasesTab';
import { ProjectTeamTab } from '@/features/project-workspace/ProjectTeamTab';
import { ProjectHoursTab } from '@/features/project-workspace/ProjectHoursTab';

type Tab = 'overview' | 'phases' | 'tasks' | 'team' | 'hours';

const TAB_LABELS: Record<Tab, string> = {
  overview: 'Visão Geral',
  phases: 'Fases',
  tasks: 'Tarefas',
  team: 'Equipe',
  hours: 'Horas',
};

const VALID_TABS: Tab[] = ['overview', 'phases', 'tasks', 'team', 'hours'];

function parseTab(value: string | null, isAdmin: boolean): Tab {
  if (!value || !VALID_TABS.includes(value as Tab)) return 'overview';
  const tab = value as Tab;
  // Non-admins can't access phases or hours
  if (!isAdmin && (tab === 'phases' || tab === 'hours')) return 'overview';
  return tab;
}

export function ProjectWorkspacePage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { isAdmin } = useAuthContext();
  const [project, setProject] = useState<Project | null>(null);
  const [summary, setSummary] = useState<ProjectWorkspaceSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>(() => parseTab(searchParams.get('tab'), isAdmin));
  const [highlightTaskId, setHighlightTaskId] = useState<string | null>(searchParams.get('task'));

  // Sync tab to URL
  const handleTabChange = useCallback((tab: Tab) => {
    setActiveTab(tab);
    const params = new URLSearchParams(searchParams);
    if (tab !== 'overview') {
      params.set('tab', tab);
    } else {
      params.delete('tab');
    }
    // Clear task highlight when switching away from tasks tab
    if (tab !== 'tasks') {
      params.delete('task');
      setHighlightTaskId(null);
    }
    setSearchParams(params, { replace: true });
  }, [searchParams, setSearchParams]);

  // Read deep link params on mount and when URL changes
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const tabParam = searchParams.get('tab');
    const taskParam = searchParams.get('task');
    if (tabParam) {
      const parsed = parseTab(tabParam, isAdmin);
      setActiveTab(parsed);
    }
    if (taskParam) {
      setHighlightTaskId(taskParam);
    }
  }, [searchParams, isAdmin]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const fetchProject = useCallback(async () => {
    if (!projectId) return;
    try {
      setLoading(true);
      setError(null);
      const { data, error: err } = await projectsAPI.list();
      if (err) throw err;
      const found = (data as Project[])?.find((p) => p.id === projectId);
      if (!found) {
        setError('Projeto não encontrado');
        return;
      }
      setProject(found);

      if (isAdmin) {
        const { data: sumData } = await projectWorkspaceAPI.getSummary(projectId);
        if (sumData && Array.isArray(sumData) && sumData.length > 0) {
          setSummary(sumData[0] as unknown as ProjectWorkspaceSummary);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? mapDatabaseError(err) : 'Erro ao carregar projeto');
    } finally {
      setLoading(false);
    }
  }, [projectId, isAdmin]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchProject();
  }, [fetchProject]);

  if (loading) {
    return (
      <div className="flex justify-center items-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-focon-600"></div>
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="space-y-4">
        <div className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-4">
          <p className="text-sm font-medium text-red-800 dark:text-red-400">
            {error || 'Projeto não encontrado'}
          </p>
        </div>
        <button
          onClick={() => navigate('/admin/projects')}
          className="px-4 py-2 bg-focon-600 hover:bg-focon-700 text-white rounded-lg font-medium transition"
        >
          Voltar para Projetos
        </button>
      </div>
    );
  }

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

  const tabs: Tab[] = isAdmin
    ? ['overview', 'phases', 'tasks', 'team', 'hours']
    : ['overview', 'tasks', 'team'];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap justify-between items-start gap-4">
        <div>
          <button
            onClick={() => navigate('/admin/projects')}
            className="text-sm text-app-muted hover:text-focon-600 dark:hover:text-focon-400 mb-2 transition"
          >
            ← Voltar para Projetos
          </button>
          <h2 className="text-2xl font-bold text-app-primary">{project.name}</h2>
          <div className="flex items-center gap-3 mt-2">
            <span className="text-sm text-app-muted">Cliente: {project.client}</span>
            <span
              className={`inline-block px-2.5 py-1 rounded-full text-xs font-semibold ${
                statusColors[project.status] || statusColors['planned']
              }`}
            >
              {statusLabels[project.status] || project.status}
            </span>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-app-primary">
        <nav className="flex flex-wrap gap-1" aria-label="Tabs">
          {tabs.map((tab) => (
            <button
              key={tab}
              onClick={() => handleTabChange(tab)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition ${
                activeTab === tab
                  ? 'border-focon-600 text-focon-600 dark:text-focon-400'
                  : 'border-transparent text-app-muted hover:text-app-secondary'
              }`}
            >
              {TAB_LABELS[tab]}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab content */}
      {activeTab === 'overview' && (
        <ProjectOverview project={project} summary={summary} isAdmin={isAdmin} />
      )}
      {activeTab === 'phases' && isAdmin && <ProjectPhasesTab projectId={project.id} />}
      {activeTab === 'tasks' && (
        <ProjectTasksTab
          projectId={project.id}
          isAdmin={isAdmin}
          highlightTaskId={highlightTaskId}
          onTaskHighlightCleared={() => {
            setHighlightTaskId(null);
            const params = new URLSearchParams(searchParams);
            params.delete('task');
            setSearchParams(params, { replace: true });
          }}
        />
      )}
      {activeTab === 'team' && <ProjectTeamTab projectId={project.id} isAdmin={isAdmin} />}
      {activeTab === 'hours' && isAdmin && <ProjectHoursTab projectId={project.id} />}
    </div>
  );
}
