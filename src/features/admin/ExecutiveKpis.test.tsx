import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ExecutiveKpis } from '@/features/admin/ExecutiveKpis';

const mockKpis = {
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
};

function renderKpis(props: Partial<Parameters<typeof ExecutiveKpis>[0]> = {}) {
  const defaultProps = {
    kpis: mockKpis,
    loading: false,
    error: null,
    onRetry: () => {},
  };
  return render(
    <MemoryRouter>
      <ExecutiveKpis {...defaultProps} {...props} />
    </MemoryRouter>
  );
}

describe('ExecutiveKpis', () => {
  it('renders all KPI cards including tax and indirect cost', () => {
    renderKpis();
    expect(screen.getByText('Receita Contratada')).toBeInTheDocument();
    expect(screen.getByText('Custo Mão de Obra')).toBeInTheDocument();
    expect(screen.getByText('Impostos')).toBeInTheDocument();
    expect(screen.getByText('Custos Indiretos')).toBeInTheDocument();
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
    const marginElement = screen.getByText('80.4%');
    expect(marginElement.className).toContain('text-green');
  });

  it('shows margin with warning color for low margin', () => {
    renderKpis({
      kpis: {
        ...mockKpis,
        total_revenue: 100000,
        total_labor_cost: 80000,
        total_tax: 10000,
        total_indirect_cost: 5000,
        total_result: 5000,
        total_margin: 5,
      },
    });
    const marginElement = screen.getByText('5.0%');
    expect(marginElement.className).toContain('text-amber');
  });

  it('shows overdue tasks with red color when > 0', () => {
    renderKpis();
    const overdueElements = screen.getAllByText('3');
    const overdueCard = overdueElements.find(el => el.className?.includes('text-red'));
    expect(overdueCard).toBeDefined();
  });

  it('renders loading skeletons when loading', () => {
    renderKpis({ loading: true });
    expect(screen.queryByText('Receita Contratada')).not.toBeInTheDocument();
  });

  it('renders error state instead of zeros when error is present', () => {
    renderKpis({ kpis: null, error: 'RPC failed' });
    expect(screen.getByText('Dados indisponíveis')).toBeInTheDocument();
    expect(screen.queryByText('R$ 0,00')).not.toBeInTheDocument();
  });

  it('renders error state with retry button', () => {
    renderKpis({ kpis: null, error: 'RPC failed' });
    expect(screen.getByText('Tentar novamente')).toBeInTheDocument();
  });

  it('shows period semantics disclaimer', () => {
    renderKpis();
    expect(screen.getByText(/Valores contratuais/)).toBeInTheDocument();
  });
});
