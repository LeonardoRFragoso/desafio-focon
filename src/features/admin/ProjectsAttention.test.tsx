/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { ProjectsAttention } from '@/features/admin/ProjectsAttention';
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

function renderProjects(props: Partial<React.ComponentProps<typeof ProjectsAttention>> = {}) {
  return render(
    <MemoryRouter>
      <ProjectsAttention
        items={[]}
        loading={false}
        error={null}
        onRetry={vi.fn()}
        {...props}
      />
    </MemoryRouter>
  );
}

describe('ProjectsAttention', () => {
  it('renders loading state', () => {
    renderProjects({ loading: true });
    expect(screen.getByText('Projetos que exigem atenção')).toBeInTheDocument();
  });

  it('renders error state with retry button', async () => {
    const onRetry = vi.fn();
    renderProjects({ error: 'Access denied', onRetry });
    expect(screen.getByText('Access denied')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('shows empty state when no projects exist', () => {
    renderProjects({ items: [] });
    expect(screen.getByText('Nenhum projeto cadastrado')).toBeInTheDocument();
  });

  // PHASE 1.4 A) 2 healthy, attention 0, health healthy=2
  it('A) 2 healthy → no attention, counts 2 healthy', () => {
    renderProjects({
      items: [
        makeItem({ id: 'p1', name: 'Alpha', health_status: 'healthy' }),
        makeItem({ id: 'p2', name: 'Beta', health_status: 'healthy' }),
      ],
    });
    expect(screen.getByText(/Nenhum projeto requer atenção/)).toBeInTheDocument();
    expect(screen.getByText(/2 projeto\(s\) saudável\(is\)/)).toBeInTheDocument();
  });

  // PHASE 1.4 B) 1 healthy + 1 attention → attention 1, health healthy=1 attention=1
  it('B) 1 healthy + 1 attention → shows 1 attention project', () => {
    renderProjects({
      items: [
        makeItem({ id: 'p1', name: 'Alpha', health_status: 'healthy' }),
        makeItem({ id: 'p2', name: 'Beta', health_status: 'attention', overdue_tasks_count: 2 }),
      ],
    });
    expect(screen.getAllByText('Beta').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/EM ATENÇÃO/).length).toBeGreaterThanOrEqual(1);
    // Alpha (healthy) should NOT appear in the attention list
    expect(screen.queryByText('Alpha')).not.toBeInTheDocument();
  });

  // PHASE 1.4 C) 2 at_risk → attention 2, health at_risk=2
  it('C) 2 at_risk → shows both in attention table', () => {
    renderProjects({
      items: [
        makeItem({ id: 'p1', name: 'Alpha', health_status: 'at_risk' }),
        makeItem({ id: 'p2', name: 'Beta', health_status: 'at_risk' }),
      ],
    });
    expect(screen.getAllByText('Alpha').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Beta').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/EM RISCO/).length).toBeGreaterThanOrEqual(2);
  });

  // PHASE 1.4 D) not_calculated is NOT healthy
  it('D) not_calculated (null) is not counted as healthy', () => {
    renderProjects({
      items: [
        makeItem({ id: 'p1', name: 'Alpha', health_status: null as any, health_score: null }),
      ],
    });
    expect(screen.getByText(/Nenhum projeto requer atenção/)).toBeInTheDocument();
    // healthy count must be 0 — no "(N projeto(s) saudável(is))" text shown when 0
    expect(screen.queryByText(/saudável\(is\)/)).not.toBeInTheDocument();
    // not_calculated noted explicitly
    expect(screen.getByText(/1 sem cálculo de saúde/)).toBeInTheDocument();
  });

  // PHASE 1.4 E) not_applicable is NOT healthy (not_applicable filtered by RPC, but guard)
  it('E) not_applicable is not counted as healthy', () => {
    renderProjects({
      items: [
        makeItem({ id: 'p1', name: 'Alpha', health_status: 'not_applicable' as any }),
      ],
    });
    // not_applicable is neither at_risk nor attention → no attention row
    expect(screen.getByText(/Nenhum projeto requer atenção/)).toBeInTheDocument();
    // not counted as healthy
    expect(screen.queryByText(/saudável\(is\)/)).not.toBeInTheDocument();
  });

  // PHASE 1.4 F) empty states consistent
  it('F) empty items → Nenhum projeto cadastrado', () => {
    renderProjects({ items: [] });
    expect(screen.getByText('Nenhum projeto cadastrado')).toBeInTheDocument();
  });

  it('shows overdue task count in red', () => {
    renderProjects({
      items: [
        makeItem({ id: 'p1', name: 'Alpha', health_status: 'at_risk', overdue_tasks_count: 3 }),
      ],
    });
    const overdueCells = screen.getAllByText('3');
    const redOne = overdueCells.find((el) => el.className.includes('text-red'));
    expect(redOne).toBeDefined();
  });

  it('shows overdue milestone count in red', () => {
    renderProjects({
      items: [
        makeItem({ id: 'p1', name: 'Alpha', health_status: 'at_risk', overdue_milestones_count: 2 }),
      ],
    });
    const cells = screen.getAllByText('2');
    const redOne = cells.find((el) => el.className.includes('text-red'));
    expect(redOne).toBeDefined();
  });
});
