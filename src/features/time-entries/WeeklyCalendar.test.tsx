import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { WeeklyCalendar } from './WeeklyCalendar';
import { AuthContext } from '@/features/auth/AuthContext';
import { timeEntriesAPI } from '@/lib/supabase/api';

vi.mock('@/lib/supabase/api', () => ({
  timeEntriesAPI: {
    getByUser: vi.fn(),
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

function getMondayDate(): string {
  const now = new Date();
  const day = now.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(now);
  monday.setDate(now.getDate() + diff);
  return monday.toISOString().slice(0, 10);
}

describe('WeeklyCalendar', () => {
  it('renders week navigation controls', async () => {
    vi.mocked(timeEntriesAPI.getByUser).mockResolvedValue({ data: [], error: null } as never);
    renderWithProviders(<WeeklyCalendar />);
    expect(screen.getByLabelText('Semana anterior')).toBeInTheDocument();
    expect(screen.getByLabelText('Próxima semana')).toBeInTheDocument();
    expect(screen.getByText('Hoje')).toBeInTheDocument();
  });

  it('shows total hours for the week', async () => {
    const monday = getMondayDate();
    const entries = [
      { id: '1', projects: { name: 'Project A' }, entry_date: monday, duration_minutes: 120, description: 'Work', approval_status: 'approved' },
      { id: '2', projects: { name: 'Project B' }, entry_date: monday, duration_minutes: 60, description: 'More work', approval_status: 'pending' },
    ];
    vi.mocked(timeEntriesAPI.getByUser).mockResolvedValue({ data: entries, error: null } as never);
    renderWithProviders(<WeeklyCalendar />);
    await screen.findByText(/Total: 3h/);
  });

  it('displays entries grouped by day (mobile view)', async () => {
    const monday = getMondayDate();
    const entries = [
      { id: '1', projects: { name: 'Project A' }, entry_date: monday, duration_minutes: 120, description: 'Work A', approval_status: 'approved' },
    ];
    vi.mocked(timeEntriesAPI.getByUser).mockResolvedValue({ data: entries, error: null } as never);
    renderWithProviders(<WeeklyCalendar />);
    await waitFor(() => {
      const elements = screen.getAllByText('Project A');
      expect(elements.length).toBeGreaterThan(0);
    });
  });

  it('shows empty state for days without entries (mobile view)', async () => {
    vi.mocked(timeEntriesAPI.getByUser).mockResolvedValue({ data: [], error: null } as never);
    renderWithProviders(<WeeklyCalendar />);
    await waitFor(() => {
      const empties = screen.getAllByText('Sem apontamentos');
      expect(empties.length).toBeGreaterThan(0);
    });
  });
});
