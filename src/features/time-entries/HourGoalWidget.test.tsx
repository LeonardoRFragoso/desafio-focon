import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { HourGoalWidget } from './HourGoalWidget';
import { AuthContext } from '@/features/auth/AuthContext';
import * as api from '@/lib/supabase/api';

vi.mock('@/lib/supabase/api', () => ({
  userPreferencesAPI: {
    get: vi.fn(),
    set: vi.fn(),
  },
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

describe('HourGoalWidget', () => {
  it('shows define button when no goal is set', async () => {
    vi.mocked(api.userPreferencesAPI.get).mockResolvedValue({ data: null, error: null } as never);
    vi.mocked(api.timeEntriesAPI.getByUser).mockResolvedValue({ data: [], error: null } as never);
    renderWithProviders(<HourGoalWidget />);
    await waitFor(() => {
      expect(screen.getByText('Definir')).toBeInTheDocument();
    });
  });

  it('shows progress and breakdown when goal is set', async () => {
    vi.mocked(api.userPreferencesAPI.get).mockResolvedValue({
      data: { pref_value: { minutes: 2400 } },
      error: null,
    } as never);
    const monday = getMondayDate();
    vi.mocked(api.timeEntriesAPI.getByUser).mockResolvedValue({
      data: [
        { entry_date: monday, duration_minutes: 480, approval_status: 'approved' },
        { entry_date: monday, duration_minutes: 120, approval_status: 'pending' },
        { entry_date: monday, duration_minutes: 60, approval_status: 'rejected' },
      ],
      error: null,
    } as never);
    renderWithProviders(<HourGoalWidget />);
    await waitFor(() => {
      // registered = approved + pending = 480 + 120 = 600 min = 10h
      // (rejected is excluded from progress per the unified goal rule)
      const elements = screen.getAllByText('10h');
      expect(elements.length).toBeGreaterThan(0);
    });
    await waitFor(() => {
      expect(screen.getByText(/de 40h/)).toBeInTheDocument();
    });
  });

  it('shows breakdown stats (approved, pending, rejected)', async () => {
    vi.mocked(api.userPreferencesAPI.get).mockResolvedValue({
      data: { pref_value: { minutes: 2400 } },
      error: null,
    } as never);
    const monday = getMondayDate();
    vi.mocked(api.timeEntriesAPI.getByUser).mockResolvedValue({
      data: [
        { entry_date: monday, duration_minutes: 480, approval_status: 'approved' },
        { entry_date: monday, duration_minutes: 120, approval_status: 'pending' },
        { entry_date: monday, duration_minutes: 60, approval_status: 'rejected' },
      ],
      error: null,
    } as never);
    renderWithProviders(<HourGoalWidget />);
    await waitFor(() => {
      expect(screen.getByText('Aprovado')).toBeInTheDocument();
      expect(screen.getByText('Pendente')).toBeInTheDocument();
      expect(screen.getByText('Rejeitado')).toBeInTheDocument();
    });
  });
});
