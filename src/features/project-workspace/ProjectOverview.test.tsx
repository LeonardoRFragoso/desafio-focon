import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ProjectOverview } from './ProjectOverview';
import type { Project, ProjectWorkspaceSummary } from '@/types/database';

const mockProject: Project = {
  id: 'test-1',
  name: 'Test Project',
  client: 'Test Client',
  status: 'active',
  start_date: '2024-01-01',
  end_date: '2024-12-31',
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
};

const mockSummary: ProjectWorkspaceSummary = {
  total_phases: 3,
  active_phases: 1,
  completed_phases: 1,
  total_tasks: 10,
  open_tasks: 6,
  done_tasks: 4,
  overdue_tasks: 2,
  team_size: 5,
  planned_minutes: 4800,
  logged_minutes: 2400,
};

describe('ProjectOverview', () => {
  it('renders project name and client', () => {
    render(<ProjectOverview project={mockProject} summary={null} isAdmin={true} />);
    expect(screen.getByText('Test Project')).toBeInTheDocument();
    expect(screen.getByText('Test Client')).toBeInTheDocument();
  });

  it('renders summary cards when summary is provided', () => {
    render(<ProjectOverview project={mockProject} summary={mockSummary} isAdmin={true} />);
    expect(screen.getByText('3')).toBeInTheDocument(); // total_phases
    expect(screen.getByText('10')).toBeInTheDocument(); // total_tasks
    expect(screen.getByText('5')).toBeInTheDocument(); // team_size
    expect(screen.getByText('80.0h')).toBeInTheDocument(); // planned_minutes 4800/60
  });

  it('shows financial restriction notice for non-admin users', () => {
    render(<ProjectOverview project={mockProject} summary={null} isAdmin={false} />);
    expect(screen.getByText(/Informações financeiras estão disponíveis apenas para administradores/)).toBeInTheDocument();
  });

  it('does not show financial restriction notice for admin users', () => {
    render(<ProjectOverview project={mockProject} summary={null} isAdmin={true} />);
    expect(screen.queryByText(/Informações financeiras estão disponíveis apenas para administradores/)).not.toBeInTheDocument();
  });

  it('renders project status', () => {
    render(<ProjectOverview project={mockProject} summary={null} isAdmin={true} />);
    expect(screen.getByText('active')).toBeInTheDocument();
  });
});
