/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ProjectHealthCard } from '@/features/project-workspace/ProjectHealthCard';
import { projectHealthAPI } from '@/lib/supabase/api';

vi.mock('@/lib/errors', () => ({
  mapDatabaseError: (err: unknown) => (err instanceof Error ? err.message : 'Erro'),
}));

const mockHealthAtRisk = {
  score: 59,
  status: 'at_risk',
  progress: 56.43,
  budget_utilization: 45.0,
  forecast_completion_date: '2024-12-31',
  forecast_labor_cost: 15000.0,
  drivers: {
    schedule: { overdue_end_penalty: 15, overdue_milestones: 2, milestone_penalty: 4, overdue_tasks: 3, task_penalty: 3, penalty: 22 },
    budget: { has_budget: true, utilization: 45.0, penalty: 0 },
    profitability: { active_alerts: 1, penalty: 5 },
    capacity: { available: true, overallocated_members: 0, max_utilization: 0, penalty: 0 },
    critical_delivery: { critical_milestones_blocked: 0, critical_milestones_overdue: 1, critical_milestones_due_soon: 0, critical_tasks_blocked: 0, critical_tasks_overdue: 1, critical_tasks_due_soon: 0, penalty: 10 },
    hard_override: 'critical_milestone_overdue_7d',
  },
  calculated_at: '2024-08-15T17:40:45.576899+00:00',
};

const mockHealthHealthy = {
  score: 90,
  status: 'healthy',
  progress: 80.0,
  budget_utilization: 50.0,
  forecast_completion_date: null,
  forecast_labor_cost: null,
  drivers: {
    schedule: { overdue_end_penalty: 0, overdue_milestones: 0, milestone_penalty: 0, overdue_tasks: 0, task_penalty: 0, penalty: 0 },
    budget: { has_budget: true, utilization: 50.0, penalty: 0 },
    profitability: { active_alerts: 0, penalty: 0 },
    capacity: { available: true, overallocated_members: 0, max_utilization: 0, penalty: 0 },
    critical_delivery: { critical_milestones_blocked: 0, critical_milestones_overdue: 0, critical_milestones_due_soon: 0, critical_tasks_blocked: 0, critical_tasks_overdue: 0, critical_tasks_due_soon: 0, penalty: 0 },
    hard_override: null,
  },
  calculated_at: '2024-08-15T17:40:45.576899+00:00',
};

function renderCard(props?: Partial<React.ComponentProps<typeof ProjectHealthCard>>) {
  return render(
    <MemoryRouter>
      <ProjectHealthCard projectId="p1" isAdmin={true} {...props} />
    </MemoryRouter>
  );
}

describe('ProjectHealthCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders loading state initially', () => {
    vi.spyOn(projectHealthAPI, 'get').mockReturnValue(new Promise(() => {}) as any);
    renderCard();
    expect(document.querySelector('.animate-pulse')).toBeInTheDocument();
  });

  it('renders at_risk health with score and status', async () => {
    vi.spyOn(projectHealthAPI, 'get').mockResolvedValue({ data: mockHealthAtRisk as any, error: null } as any);
    renderCard();
    await waitFor(() => {
      expect(screen.getByText('59')).toBeInTheDocument();
    });
    expect(screen.getByText(/Em Risco/)).toBeInTheDocument();
  });

  it('renders healthy status', async () => {
    vi.spyOn(projectHealthAPI, 'get').mockResolvedValue({ data: mockHealthHealthy as any, error: null } as any);
    renderCard();
    await waitFor(() => {
      expect(screen.getByText('90')).toBeInTheDocument();
    });
    expect(screen.getByText(/Saudável/)).toBeInTheDocument();
  });

  it('shows hard override warning for at_risk', async () => {
    vi.spyOn(projectHealthAPI, 'get').mockResolvedValue({ data: mockHealthAtRisk as any, error: null } as any);
    renderCard();
    await waitFor(() => {
      expect(screen.getByText(/Risco crítico detectado/)).toBeInTheDocument();
    });
  });

  it('does not show hard override for healthy', async () => {
    vi.spyOn(projectHealthAPI, 'get').mockResolvedValue({ data: mockHealthHealthy as any, error: null } as any);
    renderCard();
    await waitFor(() => {
      expect(screen.getByText('90')).toBeInTheDocument();
    });
    expect(screen.queryByText(/Risco crítico detectado/)).not.toBeInTheDocument();
  });

  it('shows recalculate button for admin', async () => {
    vi.spyOn(projectHealthAPI, 'get').mockResolvedValue({ data: mockHealthAtRisk as any, error: null } as any);
    renderCard({ isAdmin: true });
    await waitFor(() => {
      expect(screen.getByText(/Recalcular/)).toBeInTheDocument();
    });
  });

  it('hides recalculate button for non-admin', async () => {
    vi.spyOn(projectHealthAPI, 'get').mockResolvedValue({ data: mockHealthAtRisk as any, error: null } as any);
    renderCard({ isAdmin: false });
    await waitFor(() => {
      expect(screen.getByText('59')).toBeInTheDocument();
    });
    expect(screen.queryByText(/Recalcular/)).not.toBeInTheDocument();
  });

  it('shows forecast for admin', async () => {
    vi.spyOn(projectHealthAPI, 'get').mockResolvedValue({ data: mockHealthAtRisk as any, error: null } as any);
    renderCard({ isAdmin: true });
    await waitFor(() => {
      expect(screen.getByText('Previsão')).toBeInTheDocument();
    });
    expect(screen.getByText(/Conclusão estimada/)).toBeInTheDocument();
  });

  it('hides forecast for non-admin', async () => {
    vi.spyOn(projectHealthAPI, 'get').mockResolvedValue({ data: mockHealthAtRisk as any, error: null } as any);
    renderCard({ isAdmin: false });
    await waitFor(() => {
      expect(screen.getByText('59')).toBeInTheDocument();
    });
    expect(screen.queryByText('Previsão')).not.toBeInTheDocument();
  });

  it('shows not calculated message when health is null', async () => {
    vi.spyOn(projectHealthAPI, 'get').mockResolvedValue({ data: { score: null, status: null } as any, error: null } as any);
    renderCard({ isAdmin: true });
    await waitFor(() => {
      expect(screen.getByText(/Saúde ainda não calculada/)).toBeInTheDocument();
    });
  });

  it('shows not_applicable status with em-dash score (not 0) for completed/cancelled', async () => {
    vi.spyOn(projectHealthAPI, 'get').mockResolvedValue({
      data: {
        score: null,
        status: 'not_applicable',
        progress: null,
        budget_utilization: null,
        forecast_completion_date: null,
        forecast_labor_cost: null,
        drivers: { hard_override: 'project_not_active' },
        calculated_at: '2024-08-15T17:40:45.576899+00:00',
      } as any,
      error: null,
    } as any);
    renderCard({ isAdmin: true });
    await waitFor(() => {
      expect(screen.getByText(/Não Aplicável/)).toBeInTheDocument();
    });
    // Score must be em-dash, NOT 0 (not_applicable has no score)
    expect(screen.getByText('—')).toBeInTheDocument();
    expect(screen.queryByText('0')).not.toBeInTheDocument();
    // Must NOT show "Não calculado" (that is the missing-state case)
    expect(screen.queryByText(/Não calculado/)).not.toBeInTheDocument();
  });

  it('distinguishes not_calculated (null status) from not_applicable', async () => {
    // null status = missing state = "Saúde ainda não calculada"
    vi.spyOn(projectHealthAPI, 'get').mockResolvedValue({ data: { score: null, status: null } as any, error: null } as any);
    renderCard({ isAdmin: true });
    await waitFor(() => {
      expect(screen.getByText(/Saúde ainda não calculada/)).toBeInTheDocument();
    });
    // Must NOT show "Não Aplicável" for the missing-state case
    expect(screen.queryByText(/Não Aplicável/)).not.toBeInTheDocument();
  });

  it('shows error on API failure', async () => {
    vi.spyOn(projectHealthAPI, 'get').mockResolvedValue({ data: null, error: new Error('RPC fail') } as any);
    renderCard();
    await waitFor(() => {
      expect(screen.getByText('RPC fail')).toBeInTheDocument();
    });
  });

  it('calls recalculate when button is clicked', async () => {
    vi.spyOn(projectHealthAPI, 'get').mockResolvedValue({ data: mockHealthAtRisk as any, error: null } as any);
    const recalcSpy = vi.spyOn(projectHealthAPI, 'recalculate').mockResolvedValue({ data: null, error: null } as any);
    renderCard({ isAdmin: true });
    await waitFor(() => {
      expect(screen.getByText(/Recalcular/)).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText(/Recalcular/));
    await waitFor(() => {
      expect(recalcSpy).toHaveBeenCalledWith('p1');
    });
  });
});
