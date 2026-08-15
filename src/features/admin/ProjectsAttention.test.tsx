/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ProjectsAttention } from '@/features/admin/ProjectsAttention';
import { commandCenterAPI } from '@/lib/supabase/api';
import type { ProjectAttentionItem } from '@/lib/supabase/api';

vi.mock('@/lib/errors', () => ({
  mapDatabaseError: (err: unknown) => (err instanceof Error ? err.message : 'Erro'),
}));

const mockProjects: ProjectAttentionItem[] = [
  {
    id: 'p1',
    name: 'Residencial Aurora',
    client: 'Construção Aurora',
    status: 'active',
    approved_minutes: 3840,
    budget_value: 10000,
    budget_utilization_percent: 87,
    overdue_tasks_count: 3,
    active_alerts_count: 1,
    team_size: 2,
    attention_state: 'warning',
  },
  {
    id: 'p2',
    name: 'Edifício Horizonte',
    client: 'Horizonte Ltda',
    status: 'active',
    approved_minutes: 1920,
    budget_value: 5000,
    budget_utilization_percent: 102,
    overdue_tasks_count: 0,
    active_alerts_count: 0,
    team_size: 1,
    attention_state: 'critical',
  },
];

function renderProjects() {
  return render(
    <MemoryRouter>
      <ProjectsAttention />
    </MemoryRouter>
  );
}

describe('ProjectsAttention', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders loading state initially', () => {
    vi.spyOn(commandCenterAPI, 'getProjectsAttention').mockReturnValue(new Promise(() => {}) as any);
    renderProjects();
    expect(screen.getByText('Projetos que exigem atenção')).toBeInTheDocument();
  });

  it('renders attention projects in table on desktop', async () => {
    vi.spyOn(commandCenterAPI, 'getProjectsAttention').mockResolvedValue({ data: mockProjects as any, error: null } as any);
    renderProjects();
    await waitFor(() => {
      expect(screen.getAllByText('Residencial Aurora').length).toBeGreaterThanOrEqual(1);
    });
    expect(screen.getAllByText('Edifício Horizonte').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/ATENÇÃO/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/CRÍTICO/).length).toBeGreaterThanOrEqual(1);
  });

  it('shows empty state when no projects need attention', async () => {
    const normalProjects: ProjectAttentionItem[] = [
      {
        id: 'p1',
        name: 'Residencial Aurora',
        client: 'Construção Aurora',
        status: 'active',
        approved_minutes: 3840,
        budget_value: 10000,
        budget_utilization_percent: 30,
        overdue_tasks_count: 0,
        active_alerts_count: 0,
        team_size: 2,
        attention_state: 'normal',
      },
    ];
    vi.spyOn(commandCenterAPI, 'getProjectsAttention').mockResolvedValue({ data: normalProjects as any, error: null } as any);
    renderProjects();
    await waitFor(() => {
      expect(screen.getByText(/Nenhum projeto requer atenção/)).toBeInTheDocument();
    });
  });

  it('shows empty state when no projects exist', async () => {
    vi.spyOn(commandCenterAPI, 'getProjectsAttention').mockResolvedValue({ data: [] as any, error: null } as any);
    renderProjects();
    await waitFor(() => {
      expect(screen.getByText('Nenhum projeto cadastrado')).toBeInTheDocument();
    });
  });

  it('shows error state with retry button', async () => {
    vi.spyOn(commandCenterAPI, 'getProjectsAttention').mockResolvedValue({ data: null, error: { message: 'Access denied' } as any } as any);
    renderProjects();
    await waitFor(() => {
      expect(screen.getByText('Tentar novamente')).toBeInTheDocument();
    });
  });

  it('displays attention_state disclaimer', async () => {
    vi.spyOn(commandCenterAPI, 'getProjectsAttention').mockResolvedValue({ data: mockProjects as any, error: null } as any);
    renderProjects();
    await waitFor(() => {
      expect(screen.getByText(/attention_state é um indicador operacional temporário/)).toBeInTheDocument();
    });
  });

  it('shows overdue task count in red', async () => {
    vi.spyOn(commandCenterAPI, 'getProjectsAttention').mockResolvedValue({ data: mockProjects as any, error: null } as any);
    renderProjects();
    await waitFor(() => {
      const overdueCells = screen.getAllByText('3');
      const redOne = overdueCells.find(el => el.className.includes('text-red'));
      expect(redOne).toBeDefined();
    });
  });
});
