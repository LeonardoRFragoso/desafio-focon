import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { ProfessionalActionCenter } from './ProfessionalActionCenter';
import type { ProfessionalDashboardStats } from '@/lib/supabase/api';

// Track navigate calls so we can assert on deep-link targets.
const navigateMock = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => navigateMock,
  };
});

function makeStats(overrides: Partial<ProfessionalDashboardStats> = {}): ProfessionalDashboardStats {
  return {
    stats: { pending_count: 0, approved_count: 0, rejected_count: 0, approved_minutes: 0 },
    rejected_entries: [],
    my_tasks: [],
    task_counts: { overdue: 0, critical: 0, due_soon: 0 },
    unread_notifications: 0,
    weekly_goal: {
      configured: false,
      goal_minutes: null,
      approved_minutes: 0,
      pending_minutes: 0,
      rejected_minutes: 0,
      registered_minutes: 0,
      remaining_minutes: null,
      progress_percent: null,
      week_start: '2024-08-12',
      week_end: '2024-08-18',
    },
    ...overrides,
  };
}

function renderCenter(props: Partial<Parameters<typeof ProfessionalActionCenter>[0]> = {}) {
  return render(
    <MemoryRouter>
      <ProfessionalActionCenter stats={makeStats()} loading={false} {...props} />
    </MemoryRouter>
  );
}

describe('ProfessionalActionCenter', () => {
  beforeEach(() => {
    navigateMock.mockReset();
  });

  it('shows "Meta semanal não definida" card with Definir meta CTA when goal not configured', () => {
    renderCenter();
    expect(screen.getByText('Meta semanal não definida')).toBeInTheDocument();
    expect(screen.getByText(/Definir meta/)).toBeInTheDocument();
  });

  it('calls onDefineGoal when Definir meta is clicked (reuses existing form)', async () => {
    const onDefineGoal = vi.fn();
    renderCenter({ onDefineGoal });
    await userEvent.setup().click(screen.getByText(/Definir meta/));
    expect(onDefineGoal).toHaveBeenCalledTimes(1);
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it('shows remaining hours when goal is configured and not yet reached', () => {
    const stats = makeStats({
      weekly_goal: {
        configured: true,
        goal_minutes: 2400, // 40h
        approved_minutes: 1200, // 20h
        pending_minutes: 600, // 10h
        rejected_minutes: 300, // 5h
        registered_minutes: 1800, // 30h
        remaining_minutes: 600, // 10h
        progress_percent: 75,
        week_start: '2024-08-12',
        week_end: '2024-08-18',
      },
    });
    renderCenter({ stats });
    expect(screen.getByText(/10h restantes para a meta semanal/)).toBeInTheDocument();
    // Breakdown mentions approved + pending, and registered (not just approved)
    expect(screen.getByText(/registradas.*30h de 40h/)).toBeInTheDocument();
  });

  it('shows "Meta semanal atingida" when registered meets the goal', () => {
    const stats = makeStats({
      weekly_goal: {
        configured: true,
        goal_minutes: 2400, // 40h
        approved_minutes: 1200, // 20h
        pending_minutes: 1200, // 20h
        rejected_minutes: 600, // 10h (excluded)
        registered_minutes: 2400, // 40h = approved + pending
        remaining_minutes: 0,
        progress_percent: 100,
        week_start: '2024-08-12',
        week_end: '2024-08-18',
      },
    });
    renderCenter({ stats });
    expect(screen.getByText('Meta semanal atingida')).toBeInTheDocument();
    // Rejected is excluded from progress text
    expect(screen.getByText(/40h registradas na semana/)).toBeInTheDocument();
  });

  it('does NOT show a weekly goal progress card using a hardcoded 40h fallback', () => {
    // When configured=false, the only goal card is the "not defined" one.
    // There must be no "Meta semanal atingida" or "Xh restantes" card.
    renderCenter();
    expect(screen.queryByText('Meta semanal atingida')).not.toBeInTheDocument();
    expect(screen.queryByText(/restantes para a meta semanal/)).not.toBeInTheDocument();
  });

  it('deep-links to the specific rejected entry when exactly 1 rejected entry exists', () => {
    const stats = makeStats({
      stats: { pending_count: 0, approved_count: 0, rejected_count: 1, approved_minutes: 0 },
      rejected_entries: [
        {
          id: 'entry-uuid-1',
          project_name: 'Aurora',
          entry_date: '2024-08-14',
          duration_minutes: 60,
          rejection_reason: 'Missing description detail',
          rejected_at: '2024-08-14T10:00:00Z',
        },
      ],
    });
    renderCenter({ stats });
    expect(screen.getByText(/Ver rejeitado/)).toBeInTheDocument();
  });

  it('uses "Ver rejeitados" (plural) and generic filter when more than 1 rejected entry', () => {
    const stats = makeStats({
      stats: { pending_count: 0, approved_count: 0, rejected_count: 2, approved_minutes: 0 },
      rejected_entries: [
        { id: 'e1', project_name: 'Aurora', entry_date: '2024-08-14', duration_minutes: 60, rejection_reason: 'r1', rejected_at: '2024-08-14T10:00:00Z' },
        { id: 'e2', project_name: 'Aurora', entry_date: '2024-08-15', duration_minutes: 30, rejection_reason: 'r2', rejected_at: '2024-08-15T10:00:00Z' },
      ],
    });
    renderCenter({ stats });
    expect(screen.getByText(/Ver rejeitados/)).toBeInTheDocument();
    // The singular form must NOT be present (it would also match the plural regex,
    // so we check the exact text content instead).
    const allCtas = screen.getAllByText(/Ver rejeitad[oa]s?/);
    expect(allCtas.some((el) => el.textContent === 'Ver rejeitados →')).toBe(true);
  });

  it('navigates to /time-entries?status=rejected&entry=<id> for a single rejected entry', async () => {
    const stats = makeStats({
      stats: { pending_count: 0, approved_count: 0, rejected_count: 1, approved_minutes: 0 },
      rejected_entries: [
        { id: 'entry-uuid-1', project_name: 'Aurora', entry_date: '2024-08-14', duration_minutes: 60, rejection_reason: 'r', rejected_at: '2024-08-14T10:00:00Z' },
      ],
    });
    renderCenter({ stats });
    await userEvent.setup().click(screen.getByText(/Ver rejeitado/));
    expect(navigateMock).toHaveBeenCalledWith('/time-entries?status=rejected&entry=entry-uuid-1');
  });

  it('navigates to /time-entries?status=rejected for multiple rejected entries', async () => {
    const stats = makeStats({
      stats: { pending_count: 0, approved_count: 0, rejected_count: 2, approved_minutes: 0 },
      rejected_entries: [
        { id: 'e1', project_name: 'Aurora', entry_date: '2024-08-14', duration_minutes: 60, rejection_reason: 'r1', rejected_at: '2024-08-14T10:00:00Z' },
        { id: 'e2', project_name: 'Aurora', entry_date: '2024-08-15', duration_minutes: 30, rejection_reason: 'r2', rejected_at: '2024-08-15T10:00:00Z' },
      ],
    });
    renderCenter({ stats });
    await userEvent.setup().click(screen.getByText(/Ver rejeitados/));
    expect(navigateMock).toHaveBeenCalledWith('/time-entries?status=rejected');
  });
});
