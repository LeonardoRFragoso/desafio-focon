import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AdminActionCenter } from '@/features/admin/AdminActionCenter';
import type { AdminCommandCenterSummary } from '@/lib/supabase/api';

vi.mock('@/lib/errors', () => ({
  mapDatabaseError: (err: unknown) => (err instanceof Error ? err.message : 'Erro'),
}));

const mockSummary: AdminCommandCenterSummary = {
  period: { start_date: '2024-08-01', end_date: '2024-08-31' },
  action_signals: {
    pending_count: 5,
    old_pending_count: 2,
    old_pending_threshold_days: 3,
    rejected_recent_count: 1,
    overbudget_projects: [
      { project_id: 'p1', project_name: 'Residencial Aurora', client: 'Construção Aurora', budget_value: 10000, realized_cost: 8700, utilization_percent: 87 },
    ],
    unack_alerts_count: 1,
    overdue_tasks_count: 3,
    critical_tasks_count: 1,
    missing_rate_count: 0,
    projects_without_team_count: 1,
  },
  kpis: {
    total_revenue: 200000,
    total_tax: 20000,
    total_indirect_cost: 5000,
    total_labor_cost: 14200,
    total_result: 160800,
    total_margin: 80.4,
    approved_hours_period: 480,
    active_projects: 2,
    pending_approvals: 5,
    open_tasks: 10,
    overdue_tasks: 3,
  },
  team_summary: [],
  pending_approvals: [],
};

function renderCenter(props: Partial<Parameters<typeof AdminActionCenter>[0]> = {}) {
  return render(
    <MemoryRouter>
      <AdminActionCenter
        summary={null}
        loading={false}
        error={null}
        onRetry={vi.fn()}
        {...props}
      />
    </MemoryRouter>
  );
}

describe('AdminActionCenter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders loading skeletons initially', () => {
    renderCenter({ loading: true });
    expect(screen.getByText('O que precisa da minha atenção?')).toBeInTheDocument();
  });

  it('renders action signals from summary data', async () => {
    renderCenter({ summary: mockSummary });
    expect(screen.getByText(/5 apontamento\(s\) aguardando aprovação/)).toBeInTheDocument();
    expect(screen.getByText(/2 aguardam há mais de 3 dias/)).toBeInTheDocument();
    expect(screen.getByText(/1 apontamento\(s\) rejeitado\(s\)/)).toBeInTheDocument();
    expect(screen.getByText(/Residencial Aurora — 87% do orçamento/)).toBeInTheDocument();
    expect(screen.getByText(/1 alerta\(s\) de rentabilidade/)).toBeInTheDocument();
    expect(screen.getByText(/3 tarefa\(s\) atrasada\(s\)/)).toBeInTheDocument();
    expect(screen.getByText(/1 tarefa\(s\) crítica\(s\)/)).toBeInTheDocument();
    expect(screen.getByText(/1 projeto\(s\) ativo\(s\) sem equipe/)).toBeInTheDocument();
  });

  it('shows empty state when all signals are zero', async () => {
    const emptySummary: AdminCommandCenterSummary = {
      ...mockSummary,
      action_signals: {
        pending_count: 0,
        old_pending_count: 0,
        old_pending_threshold_days: 3,
        rejected_recent_count: 0,
        overbudget_projects: [],
        unack_alerts_count: 0,
        overdue_tasks_count: 0,
        critical_tasks_count: 0,
        missing_rate_count: 0,
        projects_without_team_count: 0,
      },
    };
    renderCenter({ summary: emptySummary });
    expect(screen.getByText('Nenhuma pendência crítica no momento')).toBeInTheDocument();
  });

  it('shows error state with retry button', async () => {
    renderCenter({ error: 'Access denied' });
    expect(screen.getByText('Tentar novamente')).toBeInTheDocument();
  });

  it('shows CRÍTICO badge for old pending entries', async () => {
    renderCenter({ summary: mockSummary });
    expect(screen.getAllByText('CRÍTICO').length).toBeGreaterThan(0);
  });

  it('does not show missing rate signal when count is 0', async () => {
    renderCenter({ summary: mockSummary });
    expect(screen.queryByText(/sem valor\/hora vigente/)).not.toBeInTheDocument();
  });
});
