import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ExecutiveKpis } from '@/features/admin/ExecutiveKpis';

function renderKpis(props: Partial<Parameters<typeof ExecutiveKpis>[0]> = {}) {
  const defaultProps = {
    kpis: {
      total_revenue: 200000,
      total_labor_cost: 14200,
      total_result: 159800,
      total_margin: 79.9,
      approved_hours_period: 480,
      active_projects: 2,
      pending_approvals: 5,
      open_tasks: 10,
      overdue_tasks: 3,
    },
  };
  return render(
    <MemoryRouter>
      <ExecutiveKpis {...defaultProps} {...props} />
    </MemoryRouter>
  );
}

describe('ExecutiveKpis', () => {
  it('renders all 9 KPI cards', () => {
    renderKpis();
    expect(screen.getByText('Receita Contratada')).toBeInTheDocument();
    expect(screen.getByText('Custo de Mão de Obra')).toBeInTheDocument();
    expect(screen.getByText('Resultado')).toBeInTheDocument();
    expect(screen.getByText('Margem')).toBeInTheDocument();
    expect(screen.getByText('Horas Aprovadas')).toBeInTheDocument();
    expect(screen.getByText('Projetos Ativos')).toBeInTheDocument();
    expect(screen.getByText('Aprovações Pendentes')).toBeInTheDocument();
    expect(screen.getByText('Tarefas Abertas')).toBeInTheDocument();
    expect(screen.getByText('Tarefas Atrasadas')).toBeInTheDocument();
  });

  it('formats currency in BRL', () => {
    renderKpis();
    expect(screen.getByText('R$ 200.000,00')).toBeInTheDocument();
    expect(screen.getByText('R$ 14.200,00')).toBeInTheDocument();
  });

  it('formats hours correctly', () => {
    renderKpis();
    expect(screen.getByText('8h')).toBeInTheDocument();
  });

  it('shows margin with correct color for high margin', () => {
    renderKpis();
    const marginElement = screen.getByText('79.9%');
    expect(marginElement.className).toContain('text-green');
  });

  it('shows margin with warning color for low margin', () => {
    renderKpis({
      kpis: {
        total_revenue: 100000,
        total_labor_cost: 90000,
        total_result: 10000,
        total_margin: 10,
        approved_hours_period: 480,
        active_projects: 2,
        pending_approvals: 5,
        open_tasks: 10,
        overdue_tasks: 3,
      },
    });
    const marginElement = screen.getByText('10.0%');
    expect(marginElement.className).toContain('text-amber');
  });

  it('shows overdue tasks with red color when > 0', () => {
    renderKpis();
    const overdueElement = screen.getByText('3');
    expect(overdueElement.className).toContain('text-red');
  });

  it('renders loading skeletons when loading', () => {
    renderKpis({ loading: true });
    // When loading, KPI labels should not be visible
    expect(screen.queryByText('Receita Contratada')).not.toBeInTheDocument();
  });
});
