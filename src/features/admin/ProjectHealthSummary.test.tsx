/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ProjectHealthSummary } from '@/features/admin/ProjectHealthSummary';
import { projectHealthAPI } from '@/lib/supabase/api';

vi.mock('@/lib/errors', () => ({
  mapDatabaseError: (err: unknown) => (err instanceof Error ? err.message : 'Erro'),
}));

const mockItems = [
  {
    id: 'p1',
    name: 'Residencial Aurora',
    client: 'Construção Aurora',
    project_status: 'active',
    start_date: '2024-01-01',
    end_date: '2024-12-31',
    health_score: 59,
    health_status: 'at_risk',
    progress_percent: 56.43,
    budget_utilization: 45.0,
    forecast_completion_date: '2024-12-31',
    forecast_labor_cost: 15000.0,
    calculated_at: '2024-08-15T17:40:45Z',
    overdue_milestones_count: 2,
    overdue_tasks_count: 3,
    total_milestones: 3,
  },
  {
    id: 'p2',
    name: 'Edifício Horizonte',
    client: 'Horizonte Ltda',
    project_status: 'active',
    start_date: '2024-02-01',
    end_date: '2024-11-30',
    health_score: 75,
    health_status: 'attention',
    progress_percent: 40.0,
    budget_utilization: 30.0,
    forecast_completion_date: null,
    forecast_labor_cost: null,
    calculated_at: '2024-08-15T17:40:45Z',
    overdue_milestones_count: 1,
    overdue_tasks_count: 0,
    total_milestones: 2,
  },
  {
    id: 'p3',
    name: 'Projeto Saudável',
    client: 'Cliente SA',
    project_status: 'active',
    start_date: '2024-01-01',
    end_date: '2024-12-31',
    health_score: 90,
    health_status: 'healthy',
    progress_percent: 80.0,
    budget_utilization: 50.0,
    forecast_completion_date: null,
    forecast_labor_cost: null,
    calculated_at: '2024-08-15T17:40:45Z',
    overdue_milestones_count: 0,
    overdue_tasks_count: 0,
    total_milestones: 2,
  },
];

function renderSummary() {
  return render(
    <MemoryRouter>
      <ProjectHealthSummary />
    </MemoryRouter>
  );
}

describe('ProjectHealthSummary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders loading state initially', () => {
    vi.spyOn(projectHealthAPI, 'getSummary').mockReturnValue(new Promise(() => {}) as any);
    renderSummary();
    expect(screen.getByText('Saúde dos Projetos')).toBeInTheDocument();
  });

  it('renders summary counts after load', async () => {
    vi.spyOn(projectHealthAPI, 'getSummary').mockResolvedValue({ data: mockItems as any, error: null } as any);
    renderSummary();
    await waitFor(() => {
      // Three counts: 1 at_risk, 1 attention, 1 healthy
      expect(screen.getByText('Em Risco')).toBeInTheDocument();
      expect(screen.getByText('Em Atenção')).toBeInTheDocument();
      expect(screen.getByText('Saudável')).toBeInTheDocument();
    });
    // Each count should be 1
    const countElements = screen.getAllByText('1');
    expect(countElements.length).toBeGreaterThanOrEqual(3);
  });

  it('shows project name for at_risk project', async () => {
    vi.spyOn(projectHealthAPI, 'getSummary').mockResolvedValue({ data: mockItems as any, error: null } as any);
    renderSummary();
    await waitFor(() => {
      expect(screen.getByText(/Residencial Aurora/)).toBeInTheDocument();
    });
  });

  it('shows error on API failure', async () => {
    vi.spyOn(projectHealthAPI, 'getSummary').mockResolvedValue({ data: null, error: new Error('fail') } as any);
    renderSummary();
    await waitFor(() => {
      expect(screen.getByText('fail')).toBeInTheDocument();
    });
  });

  it('renders nothing when no projects', async () => {
    vi.spyOn(projectHealthAPI, 'getSummary').mockResolvedValue({ data: [], error: null } as any);
    const { container } = renderSummary();
    await waitFor(() => {
      expect(container.querySelector('section')).toBeNull();
    });
  });

  it('shows Ver detalhes link', async () => {
    vi.spyOn(projectHealthAPI, 'getSummary').mockResolvedValue({ data: mockItems as any, error: null } as any);
    renderSummary();
    await waitFor(() => {
      expect(screen.getByText('Ver detalhes →')).toBeInTheDocument();
    });
  });
});
