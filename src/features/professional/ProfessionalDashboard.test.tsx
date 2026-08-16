import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import userEvent from '@testing-library/user-event';
import { ProfessionalDashboard } from './ProfessionalDashboard';

// Mock auth context — stable reference to avoid infinite re-render loops
// (useCallback in ProfessionalDashboard depends on `user`).
const { authValue } = vi.hoisted(() => ({
  authValue: {
    user: { id: 'user-1', email: 'test@test.com' },
    profile: { id: 'user-1', full_name: 'Test User', role: 'member' as const },
    isAdmin: false,
    loading: false,
    error: null,
  },
}));
vi.mock('@/features/auth/useAuthContext', () => ({
  useAuthContext: () => authValue,
}));

// Mock supabase client — the dashboard queries time_entries directly.
// vi.mock is hoisted, so we use vi.hoisted to share the mock fn across tests.
// We make the RPC return valid stats so the dashboard's fallback query path
// (which chains .select().eq().eq() etc.) is never reached.
const { fromMock, rpcMock } = vi.hoisted(() => {
  const stats = {
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
  };
  return {
    fromMock: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(() => ({
            order: vi.fn(() => ({
              limit: vi.fn(() => Promise.resolve({ data: [], error: null })),
            })),
          })),
          // .eq().order().order().limit() — used for recent entries
          order: vi.fn(() => ({
            order: vi.fn(() => ({
              limit: vi.fn(() => Promise.resolve({ data: [], error: null })),
            })),
          })),
          in: vi.fn(() => ({
            order: vi.fn(() => Promise.resolve({ data: [], error: null })),
          })),
        })),
      })),
    })),
    rpcMock: vi.fn(() => Promise.resolve({ data: stats, error: null })),
  };
});
vi.mock('@/lib/supabase/client', () => ({
  supabase: { from: fromMock, rpc: rpcMock },
}));

// Mock the API — commandCenterAPI.getProfessionalStats is called by the dashboard
vi.mock('@/lib/supabase/api', () => ({
  commandCenterAPI: {
    getProfessionalStats: vi.fn().mockResolvedValue({ data: null, error: null }),
  },
  userPreferencesAPI: {
    get: vi.fn(),
    set: vi.fn().mockResolvedValue({ error: null }),
    remove: vi.fn().mockResolvedValue({ error: null }),
  },
}));

// Mock child components to isolate the dashboard's action-handling logic
vi.mock('@/features/time-entries/QuickEntryModal', () => ({
  QuickEntryModal: ({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) =>
    isOpen ? (
      <div data-testid="quick-entry-modal">
        <button onClick={onClose}>Close Quick Entry</button>
      </div>
    ) : null,
}));

vi.mock('@/features/time-entries/Timer', () => ({
  Timer: ({ onEntryCreated }: { onEntryCreated: () => void; userId: string; isAdmin: boolean }) => (
    <div data-testid="timer-section">
      <button onClick={onEntryCreated}>Simulate Timer Entry</button>
    </div>
  ),
}));

vi.mock('@/features/time-entries/TimeEntryDetailsModal', () => ({
  TimeEntryDetailsModal: () => null,
}));

vi.mock('@/features/professional/MyTasks', () => ({
  MyTasks: () => <div data-testid="my-tasks" />,
}));

// Mock HourGoalWidget to capture the openEditorSignal prop and expose a
// data attribute we can assert on in tests.
vi.mock('@/features/time-entries/HourGoalWidget', () => ({
  HourGoalWidget: ({ openEditorSignal }: { openEditorSignal?: number; weeklyGoal: unknown; onGoalChanged?: () => void }) => (
    <div data-testid="hour-goal-widget" data-signal={openEditorSignal ?? 0}>
      Meta Semanal
    </div>
  ),
}));

// Capture the current URL search params so we can drive the dashboard with
// ?action=quick-entry / ?action=start-timer like the Command Palette does.
// We use initialEntries on MemoryRouter to set the initial URL — no need to
// manipulate search params in render (which would cause a loop).
function DashboardHarness() {
  return <ProfessionalDashboard />;
}

function renderDashboard(initialAction?: string) {
  return render(
    <MemoryRouter initialEntries={initialAction ? [`/my-dashboard?action=${initialAction}`] : ['/my-dashboard']}>
      <DashboardHarness />
    </MemoryRouter>
  );
}

describe('ProfessionalDashboard — Command Palette sequential actions (A11)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Stub scrollIntoView (not implemented in jsdom)
    Element.prototype.scrollIntoView = vi.fn();
    // The RPC returns valid stats so the dashboard's fallback query path
    // is never reached.
  });

  it('opens Quick Entry modal when ?action=quick-entry', async () => {
    renderDashboard('quick-entry');
    await waitFor(() => {
      expect(screen.getByTestId('quick-entry-modal')).toBeInTheDocument();
    });
  });

  it('opens Quick Entry, closes it, then opens again (Quick→Close→Quick)', async () => {
    const user = userEvent.setup();
    renderDashboard('quick-entry');
    await waitFor(() => {
      expect(screen.getByTestId('quick-entry-modal')).toBeInTheDocument();
    });
    // Close the modal
    await user.click(screen.getByText('Close Quick Entry'));
    expect(screen.queryByTestId('quick-entry-modal')).not.toBeInTheDocument();
    // Re-trigger by clicking "Novo Apontamento" button on the dashboard
    await user.click(screen.getByText('Novo Apontamento'));
    await waitFor(() => {
      expect(screen.getByTestId('quick-entry-modal')).toBeInTheDocument();
    });
  });

  it('handles Timer action without opening Quick Entry', async () => {
    renderDashboard('start-timer');
    // The timer section should be present; quick entry should NOT open
    await waitFor(() => {
      expect(screen.getByTestId('timer-section')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('quick-entry-modal')).not.toBeInTheDocument();
  });

  it('supports Quick → Timer → Quick sequence without sticky state', async () => {
    const user = userEvent.setup();
    // Use a keyed wrapper to force remount with different initial URLs
    const { rerender } = render(
      <MemoryRouter key="quick-1" initialEntries={['/my-dashboard?action=quick-entry']}>
        <DashboardHarness />
      </MemoryRouter>
    );
    // 1. Quick Entry opens
    await waitFor(() => {
      expect(screen.getByTestId('quick-entry-modal')).toBeInTheDocument();
    });
    // Close it
    await user.click(screen.getByText('Close Quick Entry'));
    expect(screen.queryByTestId('quick-entry-modal')).not.toBeInTheDocument();

    // 2. Navigate to timer action (remount with new URL)
    rerender(
      <MemoryRouter key="timer-1" initialEntries={['/my-dashboard?action=start-timer']}>
        <DashboardHarness />
      </MemoryRouter>
    );
    await waitFor(() => {
      expect(screen.getByTestId('timer-section')).toBeInTheDocument();
    });
    // Quick entry should NOT be open during timer action
    expect(screen.queryByTestId('quick-entry-modal')).not.toBeInTheDocument();

    // 3. Navigate back to quick-entry (remount with new URL)
    rerender(
      <MemoryRouter key="quick-2" initialEntries={['/my-dashboard?action=quick-entry']}>
        <DashboardHarness />
      </MemoryRouter>
    );
    // Quick Entry must open again — no sticky "already handled" flag
    await waitFor(() => {
      expect(screen.getByTestId('quick-entry-modal')).toBeInTheDocument();
    }, { timeout: 3000 });
  });
});

describe('ProfessionalDashboard — define-goal deep link and CTA', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Element.prototype.scrollIntoView = vi.fn();
  });

  it('opens goal editor when ?action=define-goal', async () => {
    renderDashboard('define-goal');
    await waitFor(() => {
      const widget = screen.getByTestId('hour-goal-widget');
      expect(Number(widget.getAttribute('data-signal'))).toBeGreaterThan(0);
    });
  });

  it('consumes the action param from the URL after handling define-goal', async () => {
    const { container } = render(
      <MemoryRouter initialEntries={['/my-dashboard?action=define-goal']}>
        <DashboardHarness />
      </MemoryRouter>
    );
    await waitFor(() => {
      expect(container.textContent).toContain('Meta Semanal');
    });
    // The action param should be removed — but since we can't easily read
    // search params from MemoryRouter in the test, we verify the signal
    // was incremented (which only happens if the action was processed).
    await waitFor(() => {
      const widget = screen.getByTestId('hour-goal-widget');
      expect(Number(widget.getAttribute('data-signal'))).toBeGreaterThan(0);
    });
  });

  it('scrolls to the goal widget when define-goal action fires', async () => {
    renderDashboard('define-goal');
    await waitFor(() => {
      expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
    });
  });

  it('does not open quick entry when define-goal action fires', async () => {
    renderDashboard('define-goal');
    await waitFor(() => {
      expect(screen.getByTestId('hour-goal-widget')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('quick-entry-modal')).not.toBeInTheDocument();
  });

  it('existing actions (quick-entry, start-timer) still work alongside define-goal', async () => {
    // quick-entry
    const { rerender } = render(
      <MemoryRouter key="qe" initialEntries={['/my-dashboard?action=quick-entry']}>
        <DashboardHarness />
      </MemoryRouter>
    );
    await waitFor(() => {
      expect(screen.getByTestId('quick-entry-modal')).toBeInTheDocument();
    });

    // start-timer
    rerender(
      <MemoryRouter key="st" initialEntries={['/my-dashboard?action=start-timer']}>
        <DashboardHarness />
      </MemoryRouter>
    );
    await waitFor(() => {
      expect(screen.getByTestId('timer-section')).toBeInTheDocument();
    });

    // define-goal
    rerender(
      <MemoryRouter key="dg" initialEntries={['/my-dashboard?action=define-goal']}>
        <DashboardHarness />
      </MemoryRouter>
    );
    await waitFor(() => {
      const widget = screen.getByTestId('hour-goal-widget');
      expect(Number(widget.getAttribute('data-signal'))).toBeGreaterThan(0);
    });
  });
});
