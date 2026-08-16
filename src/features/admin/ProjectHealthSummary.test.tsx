/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { ProjectHealthSummary } from '@/features/admin/ProjectHealthSummary';
import type { ProjectHealthSummaryItem } from '@/types/database';

function makeItem(overrides: Partial<ProjectHealthSummaryItem> = {}): ProjectHealthSummaryItem {
  return {
    id: 'p1',
    name: 'Residencial Aurora',
    client: 'Construção Aurora',
    project_status: 'active',
    start_date: '2024-01-01',
    end_date: '2024-12-31',
    health_score: 80,
    health_status: 'healthy',
    has_calculated_state: true,
    progress_percent: 50,
    budget_utilization: 40,
    forecast_completion_date: null,
    forecast_labor_cost: null,
    calculated_at: '2024-08-15T17:40:45Z',
    overdue_milestones_count: 0,
    overdue_tasks_count: 0,
    total_milestones: 2,
    ...overrides,
  };
}

function renderSummary(props: Partial<React.ComponentProps<typeof ProjectHealthSummary>> = {}) {
  return render(
    <MemoryRouter>
      <ProjectHealthSummary
        items={[]}
        loading={false}
        error={null}
        onRetry={vi.fn()}
        {...props}
      />
    </MemoryRouter>
  );
}

describe('ProjectHealthSummary', () => {
  it('renders loading state', () => {
    renderSummary({ loading: true });
    expect(screen.getByText('Saúde dos Projetos')).toBeInTheDocument();
  });

  it('renders error state with retry', async () => {
    const onRetry = vi.fn();
    renderSummary({ error: 'fail', onRetry });
    expect(screen.getByText('fail')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('renders empty state when no projects', () => {
    renderSummary({ items: [] });
    expect(screen.getByText(/Nenhum projeto ativo ou planejado/)).toBeInTheDocument();
  });

  it('renders counts: 1 at_risk, 1 attention, 1 healthy', () => {
    renderSummary({
      items: [
        makeItem({ id: 'p1', name: 'Alpha', health_status: 'at_risk' }),
        makeItem({ id: 'p2', name: 'Beta', health_status: 'attention' }),
        makeItem({ id: 'p3', name: 'Gamma', health_status: 'healthy' }),
      ],
    });
    expect(screen.getByText('Em Risco')).toBeInTheDocument();
    expect(screen.getByText('Em Atenção')).toBeInTheDocument();
    expect(screen.getByText('Saudável')).toBeInTheDocument();
    const ones = screen.getAllByText('1');
    expect(ones.length).toBeGreaterThanOrEqual(3);
  });

  it('shows at_risk project name', () => {
    renderSummary({
      items: [makeItem({ id: 'p1', name: 'Residencial Aurora', health_status: 'at_risk' })],
    });
    expect(screen.getByText(/Residencial Aurora/)).toBeInTheDocument();
  });

  it('shows Ver detalhes link', () => {
    renderSummary({ items: [makeItem({ health_status: 'healthy' })] });
    expect(screen.getByText('Ver detalhes →')).toBeInTheDocument();
  });

  // PHASE 1.4 D) not_calculated not counted as healthy
  it('D) not_calculated (null) not counted as healthy, noted explicitly', () => {
    renderSummary({
      items: [
        makeItem({ id: 'p1', name: 'Alpha', health_status: null as any, health_score: null }),
        makeItem({ id: 'p2', name: 'Beta', health_status: 'healthy' }),
      ],
    });
    // healthy count = 1 (only Beta)
    const healthyCard = screen.getByText('Saudável').parentElement;
    expect(healthyCard?.querySelector('.text-3xl')?.textContent).toBe('1');
    // not_calculated note present
    expect(screen.getByText(/1 projeto\(s\) sem cálculo de saúde/)).toBeInTheDocument();
  });

  // PHASE 1.4 E) not_applicable not counted as healthy
  it('E) not_applicable not counted as healthy', () => {
    renderSummary({
      items: [makeItem({ id: 'p1', name: 'Alpha', health_status: 'not_applicable' as any })],
    });
    const healthyCard = screen.getByText('Saudável').parentElement;
    expect(healthyCard?.querySelector('.text-3xl')?.textContent).toBe('0');
  });

  // PHASE 1.4 A) 2 healthy
  it('A) 2 healthy → Saudável count = 2', () => {
    renderSummary({
      items: [
        makeItem({ id: 'p1', name: 'Alpha', health_status: 'healthy' }),
        makeItem({ id: 'p2', name: 'Beta', health_status: 'healthy' }),
      ],
    });
    const healthyCard = screen.getByText('Saudável').parentElement;
    expect(healthyCard?.querySelector('.text-3xl')?.textContent).toBe('2');
  });
});
