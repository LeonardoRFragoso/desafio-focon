import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { HourGoalWidget } from './HourGoalWidget';
import { AuthContext } from '@/features/auth/AuthContext';
import * as api from '@/lib/supabase/api';
import type { ProfessionalDashboardStats } from '@/lib/supabase/api';

// Mock the API — the widget now uses commandCenterAPI (RPC) via useWeeklyGoal,
// and userPreferencesAPI for save/remove. No more timeEntriesAPI.getByUser.
vi.mock('@/lib/supabase/api', () => ({
  userPreferencesAPI: {
    get: vi.fn(),
    set: vi.fn().mockResolvedValue({ error: null }),
    remove: vi.fn().mockResolvedValue({ error: null }),
  },
  commandCenterAPI: {
    getProfessionalStats: vi.fn(),
  },
}));

const mockAuthValue = {
  user: { id: 'user-1', email: 'test@test.com' },
  profile: { id: 'user-1', full_name: 'Test User', role: 'member' as const },
  loading: false,
  error: null,
  login: vi.fn(),
  logout: vi.fn(),
  isAdmin: false,
} as never;

function renderWithProviders(ui: React.ReactElement) {
  return render(
    <MemoryRouter>
      <AuthContext.Provider value={mockAuthValue}>{ui}</AuthContext.Provider>
    </MemoryRouter>
  );
}

function makeWeeklyGoal(overrides: Partial<ProfessionalDashboardStats['weekly_goal']> = {}): ProfessionalDashboardStats['weekly_goal'] {
  return {
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
    ...overrides,
  };
}

function makeStats(weeklyGoal: ProfessionalDashboardStats['weekly_goal']): ProfessionalDashboardStats {
  return {
    stats: { pending_count: 0, approved_count: 0, rejected_count: 0, approved_minutes: 0 },
    rejected_entries: [],
    my_tasks: [],
    task_counts: { overdue: 0, critical: 0, due_soon: 0 },
    unread_notifications: 0,
    weekly_goal: weeklyGoal,
  };
}

describe('HourGoalWidget', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default mock: RPC returns the stats with the given weekly_goal
    vi.mocked(api.commandCenterAPI.getProfessionalStats).mockImplementation(async () => {
      // This is overridden per-test as needed
      return { data: null, error: null } as never;
    });
  });

  it('shows "Definir" button when goal is not configured', () => {
    const wg = makeWeeklyGoal({ configured: false });
    renderWithProviders(<HourGoalWidget weeklyGoal={wg} />);
    expect(screen.getByText('Definir')).toBeInTheDocument();
    expect(screen.getByText('Nenhuma meta definida')).toBeInTheDocument();
  });

  it('shows progress and breakdown when goal is configured', () => {
    const wg = makeWeeklyGoal({
      configured: true,
      goal_minutes: 2400, // 40h
      approved_minutes: 480, // 8h
      pending_minutes: 120, // 2h
      rejected_minutes: 60, // 1h
      registered_minutes: 600, // 10h (approved + pending)
      remaining_minutes: 1800, // 30h
      progress_percent: 25,
    });
    renderWithProviders(<HourGoalWidget weeklyGoal={wg} />);
    // registered = 10h (appears in progress bar and breakdown)
    const elements = screen.getAllByText('10h');
    expect(elements.length).toBeGreaterThan(0);
    // goal = 40h
    expect(screen.getByText(/de 40h/)).toBeInTheDocument();
    // remaining = 30h
    expect(screen.getByText(/Faltam 30h/)).toBeInTheDocument();
  });

  it('shows breakdown stats (approved, pending, rejected, registered)', () => {
    const wg = makeWeeklyGoal({
      configured: true,
      goal_minutes: 2400,
      approved_minutes: 480,
      pending_minutes: 120,
      rejected_minutes: 60,
      registered_minutes: 600,
      remaining_minutes: 1800,
      progress_percent: 25,
    });
    renderWithProviders(<HourGoalWidget weeklyGoal={wg} />);
    expect(screen.getByText('Aprovado')).toBeInTheDocument();
    expect(screen.getByText('Pendente')).toBeInTheDocument();
    expect(screen.getByText('Rejeitado')).toBeInTheDocument();
    expect(screen.getByText('Registrado')).toBeInTheDocument();
  });

  it('excludes rejected from registered (approved + pending only)', () => {
    const wg = makeWeeklyGoal({
      configured: true,
      goal_minutes: 2400,
      approved_minutes: 1200, // 20h
      pending_minutes: 0,
      rejected_minutes: 1200, // 20h — must NOT count
      registered_minutes: 1200, // 20h (only approved + pending)
      remaining_minutes: 1200,
      progress_percent: 50,
    });
    renderWithProviders(<HourGoalWidget weeklyGoal={wg} />);
    // Registered should be 20h, not 40h (20h appears for registered + approved)
    const elements = screen.getAllByText('20h');
    expect(elements.length).toBeGreaterThan(0);
    // 40h should NOT appear (that would mean rejected was counted)
    expect(screen.queryByText('40h')).not.toBeInTheDocument();
  });

  it('shows "Meta atingida!" when remaining is 0', () => {
    const wg = makeWeeklyGoal({
      configured: true,
      goal_minutes: 2400,
      approved_minutes: 1200,
      pending_minutes: 1200,
      rejected_minutes: 0,
      registered_minutes: 2400,
      remaining_minutes: 0,
      progress_percent: 100,
    });
    renderWithProviders(<HourGoalWidget weeklyGoal={wg} />);
    expect(screen.getByText('Meta atingida!')).toBeInTheDocument();
  });

  it('formats sub-hour remainders correctly (30m, not 0h)', () => {
    const wg = makeWeeklyGoal({
      configured: true,
      goal_minutes: 2400,
      approved_minutes: 1380, // 23h
      pending_minutes: 990, // 16h30
      rejected_minutes: 0,
      registered_minutes: 2370, // 39h30
      remaining_minutes: 30, // 30m — must show "30m", not "0h"
      progress_percent: 98.75,
    });
    renderWithProviders(<HourGoalWidget weeklyGoal={wg} />);
    expect(screen.getByText(/Faltam 30m/)).toBeInTheDocument();
  });

  it('preserves fractional goal in the editor input (37.5h, not 38h)', async () => {
    const user = userEvent.setup();
    const wg = makeWeeklyGoal({
      configured: true,
      goal_minutes: 2250, // 37.5h
      approved_minutes: 0,
      pending_minutes: 0,
      rejected_minutes: 0,
      registered_minutes: 0,
      remaining_minutes: 2250,
      progress_percent: 0,
    });
    renderWithProviders(<HourGoalWidget weeklyGoal={wg} />);
    await user.click(screen.getByText('Alterar'));
    const input = screen.getByDisplayValue('37.5');
    expect(input).toBeInTheDocument();
  });

  it('shows "Remover meta" button when goal is configured and editing', async () => {
    const user = userEvent.setup();
    const wg = makeWeeklyGoal({
      configured: true,
      goal_minutes: 2400,
      approved_minutes: 0,
      pending_minutes: 0,
      rejected_minutes: 0,
      registered_minutes: 0,
      remaining_minutes: 2400,
      progress_percent: 0,
    });
    renderWithProviders(<HourGoalWidget weeklyGoal={wg} />);
    await user.click(screen.getByText('Alterar'));
    expect(screen.getByText('Remover meta')).toBeInTheDocument();
  });

  it('does NOT show "Remover meta" when goal is not configured', async () => {
    const user = userEvent.setup();
    const wg = makeWeeklyGoal({ configured: false });
    renderWithProviders(<HourGoalWidget weeklyGoal={wg} />);
    await user.click(screen.getByText('Definir'));
    expect(screen.queryByText('Remover meta')).not.toBeInTheDocument();
  });

  it('rejects 0 hours as invalid with error message', async () => {
    const user = userEvent.setup();
    const wg = makeWeeklyGoal({ configured: false });
    renderWithProviders(<HourGoalWidget weeklyGoal={wg} />);
    await user.click(screen.getByText('Definir'));
    const input = screen.getByRole('spinbutton') as HTMLInputElement;
    await user.clear(input);
    await user.type(input, '0');
    await user.click(screen.getByText('Salvar'));
    expect(screen.getByText(/maior que 0 horas/)).toBeInTheDocument();
  });

  it('calls saveGoal and refetches RPC on save', async () => {
    const user = userEvent.setup();
    const wg = makeWeeklyGoal({ configured: false });
    const onGoalChanged = vi.fn();
    // Mock the RPC refetch to return configured=true
    vi.mocked(api.commandCenterAPI.getProfessionalStats).mockResolvedValue({
      data: makeStats(makeWeeklyGoal({
        configured: true,
        goal_minutes: 2400,
        registered_minutes: 0,
        remaining_minutes: 2400,
        progress_percent: 0,
      })),
      error: null,
    } as never);
    renderWithProviders(<HourGoalWidget weeklyGoal={wg} onGoalChanged={onGoalChanged} />);
    await user.click(screen.getByText('Definir'));
    const input = screen.getByRole('spinbutton') as HTMLInputElement;
    await user.clear(input);
    await user.type(input, '40');
    await user.click(screen.getByText('Salvar'));
    await waitFor(() => {
      expect(api.userPreferencesAPI.set).toHaveBeenCalledWith('user-1', 'expected_weekly_minutes', { minutes: 2400 });
    });
    await waitFor(() => {
      expect(api.commandCenterAPI.getProfessionalStats).toHaveBeenCalledWith('user-1');
    });
    await waitFor(() => {
      expect(onGoalChanged).toHaveBeenCalled();
    });
  });

  it('opens editor when openEditorSignal increments', () => {
    const wg = makeWeeklyGoal({ configured: false });
    renderWithProviders(<HourGoalWidget weeklyGoal={wg} openEditorSignal={1} />);
    // Editor should be open (signal > 0)
    expect(screen.getByText('Salvar')).toBeInTheDocument();
  });

  it('shows loading state when weeklyGoal is null', () => {
    renderWithProviders(<HourGoalWidget weeklyGoal={null} />);
    // The skeleton loader has animate-pulse
    const skeleton = document.querySelector('.animate-pulse');
    expect(skeleton).toBeInTheDocument();
  });
});
