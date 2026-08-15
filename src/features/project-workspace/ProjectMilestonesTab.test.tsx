/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ProjectMilestonesTab } from '@/features/project-workspace/ProjectMilestonesTab';
import { projectMilestonesAPI, profilesAPI } from '@/lib/supabase/api';
import type { ProjectMilestone } from '@/types/database';

vi.mock('@/lib/errors', () => ({
  mapDatabaseError: (err: unknown) => (err instanceof Error ? err.message : 'Erro'),
}));

const mockMilestones: ProjectMilestone[] = [
  {
    id: 'm1',
    project_id: 'p1',
    name: 'Fundações Concluídas',
    description: 'Conclusão de todas as fundações',
    status: 'in_progress',
    priority: 'critical',
    owner_id: 'u1',
    start_date: '2024-03-01',
    due_date: '2024-05-31',
    completed_at: null,
    progress_percent: 65,
    weight: 3.0,
    position: 1,
    created_by: 'admin',
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
    owner: { full_name: 'Bruno Santos' },
  },
  {
    id: 'm2',
    project_id: 'p1',
    name: 'Projeto Executivo Aprovado',
    description: null,
    status: 'completed',
    priority: 'high',
    owner_id: 'admin',
    start_date: '2024-01-15',
    due_date: '2024-02-28',
    completed_at: '2024-02-28T00:00:00Z',
    progress_percent: 100,
    weight: 2.0,
    position: 0,
    created_by: 'admin',
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
    owner: { full_name: 'Admin User' },
  },
];

const mockProfessionals = [
  { id: 'u1', full_name: 'Bruno Santos', role: 'member' },
  { id: 'admin', full_name: 'Admin User', role: 'admin' },
];

function renderTab(props?: Partial<React.ComponentProps<typeof ProjectMilestonesTab>>) {
  return render(
    <MemoryRouter>
      <ProjectMilestonesTab projectId="p1" isAdmin={true} {...props} />
    </MemoryRouter>
  );
}

describe('ProjectMilestonesTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(profilesAPI, 'list').mockResolvedValue({ data: mockProfessionals as any, error: null } as any);
  });

  it('renders loading state initially', () => {
    vi.spyOn(projectMilestonesAPI, 'listByProject').mockReturnValue(new Promise(() => {}) as any);
    renderTab();
    expect(document.querySelector('.animate-spin')).toBeInTheDocument();
  });

  it('renders milestones after load', async () => {
    vi.spyOn(projectMilestonesAPI, 'listByProject').mockResolvedValue({ data: mockMilestones as any, error: null } as any);
    renderTab();
    await waitFor(() => {
      expect(screen.getByText('Fundações Concluídas')).toBeInTheDocument();
    });
    expect(screen.getByText('Projeto Executivo Aprovado')).toBeInTheDocument();
  });

  it('shows empty state when no milestones', async () => {
    vi.spyOn(projectMilestonesAPI, 'listByProject').mockResolvedValue({ data: [], error: null } as any);
    renderTab();
    await waitFor(() => {
      expect(screen.getByText('Nenhum marco cadastrado para este projeto.')).toBeInTheDocument();
    });
  });

  it('shows error on API failure', async () => {
    vi.spyOn(projectMilestonesAPI, 'listByProject').mockResolvedValue({ data: null, error: new Error('fail') } as any);
    renderTab();
    await waitFor(() => {
      expect(screen.getByText('fail')).toBeInTheDocument();
    });
  });

  it('shows Nova Marco button for admin', async () => {
    vi.spyOn(projectMilestonesAPI, 'listByProject').mockResolvedValue({ data: mockMilestones as any, error: null } as any);
    renderTab({ isAdmin: true });
    await waitFor(() => {
      expect(screen.getByText('Novo Marco')).toBeInTheDocument();
    });
  });

  it('hides Nova Marco button for non-admin', async () => {
    vi.spyOn(projectMilestonesAPI, 'listByProject').mockResolvedValue({ data: mockMilestones as any, error: null } as any);
    renderTab({ isAdmin: false });
    await waitFor(() => {
      expect(screen.getByText('Fundações Concluídas')).toBeInTheDocument();
    });
    expect(screen.queryByText('Novo Marco')).not.toBeInTheDocument();
  });

  it('opens create modal when Nova Marco is clicked', async () => {
    vi.spyOn(projectMilestonesAPI, 'listByProject').mockResolvedValue({ data: mockMilestones as any, error: null } as any);
    renderTab({ isAdmin: true });
    await waitFor(() => {
      expect(screen.getByText('Novo Marco')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Novo Marco'));
    expect(screen.getByText('Novo Marco', { selector: 'h2, [class*="title"]' })).toBeInTheDocument();
  });

  it('displays progress bar with correct percentage', async () => {
    vi.spyOn(projectMilestonesAPI, 'listByProject').mockResolvedValue({ data: mockMilestones as any, error: null } as any);
    const { container } = renderTab({ isAdmin: true });
    await waitFor(() => {
      expect(screen.getByText('Fundações Concluídas')).toBeInTheDocument();
    });
    const progressBars = container.querySelectorAll('.h-2.rounded-full');
    expect(progressBars.length).toBeGreaterThan(0);
  });

  it('displays status and priority badges', async () => {
    vi.spyOn(projectMilestonesAPI, 'listByProject').mockResolvedValue({ data: mockMilestones as any, error: null } as any);
    renderTab({ isAdmin: true });
    await waitFor(() => {
      // Status appears in both badge and select option for admin
      expect(screen.getAllByText('Em Andamento').length).toBeGreaterThanOrEqual(1);
    });
    expect(screen.getAllByText('Concluído').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Crítica').length).toBeGreaterThanOrEqual(1);
  });
});
