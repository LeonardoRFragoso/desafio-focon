import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { TimeEntryList } from './TimeEntryList';

// Mock the supabase client (used for the projects dropdown query)
vi.mock('@/lib/supabase/client', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        in: vi.fn(() => ({
          order: vi.fn(() => ({ data: [] })),
        })),
      })),
    })),
  },
}));

const queryUserEntriesMock = vi.fn();
const getByIdMock = vi.fn();

vi.mock('@/lib/supabase/api', () => ({
  timeEntriesAPI: {
    queryUserEntries: (...args: unknown[]) => queryUserEntriesMock(...args),
    getById: (id: string) => getByIdMock(id),
  },
  projectPhasesAPI: { listByProject: vi.fn().mockResolvedValue({ data: [] }) },
  projectTasksAPI: { listByProject: vi.fn().mockResolvedValue({ data: [] }) },
}));

// Mock the panels rendered inside TimeEntryDetailsModal to avoid pulling in
// the full commentsAPI/attachmentsAPI surface (they're not relevant to the
// URL query-param behavior under test).
vi.mock('@/features/time-entries/CommentsPanel', () => ({
  CommentsPanel: () => <div data-testid="comments-panel-mock" />,
}));
vi.mock('@/features/time-entries/AttachmentsPanel', () => ({
  AttachmentsPanel: () => <div data-testid="attachments-panel-mock" />,
}));

vi.mock('@/features/auth/useAuthContext', () => {
  // Stable reference — if user is a new object each render, useCallback deps
  // in TimeEntryList change every render and the fetch effect loops forever.
  const user = { id: 'user-1' };
  return {
    useAuthContext: () => ({ user, isAdmin: false }),
  };
});

vi.mock('@/lib/errors', () => ({ mapDatabaseError: (e: unknown) => (e instanceof Error ? e.message : 'Erro') }));

function makeEntry(id: string, status: 'pending' | 'approved' | 'rejected' = 'pending') {
  return {
    id,
    project_id: 'p1',
    professional_id: 'user-1',
    entry_date: '2024-08-14',
    duration_minutes: 60,
    description: 'Test entry',
    approval_status: status,
    applied_hourly_rate: null,
    rejection_reason: status === 'rejected' ? 'Needs more detail' : null,
    rejected_by: null,
    rejected_at: null,
    created_at: '2024-08-14T10:00:00Z',
    updated_at: null,
    phase_id: null,
    task_id: null,
    project: { name: 'Aurora' },
    phase: null,
    task: null,
    rejected_by_profile: null,
  };
}

const sampleEntry = makeEntry('e1', 'rejected');

function renderList(initialPath = '/time-entries') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <TimeEntryList />
    </MemoryRouter>
  );
}

describe('TimeEntryList — URL query params', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Return at least one entry so the filter bar renders (the component
    // short-circuits to a loading/empty state when there are no entries).
    queryUserEntriesMock.mockResolvedValue({ data: [sampleEntry], error: null, count: 1 });
  });

  it('initializes the status filter from ?status=rejected', async () => {
    renderList('/time-entries?status=rejected');
    await waitFor(() => {
      expect(queryUserEntriesMock).toHaveBeenCalled();
    });
    const call = queryUserEntriesMock.mock.calls[0]![0] as { status?: string };
    expect(call.status).toBe('rejected');
  });

  it('selects the Rejeitado option in the status dropdown when ?status=rejected', async () => {
    renderList('/time-entries?status=rejected');
    await waitFor(() => {
      const select = screen.getByLabelText('Filtrar por status') as HTMLSelectElement;
      expect(select.value).toBe('rejected');
    });
  });

  it('opens the entry details modal when ?entry=<id> is present', async () => {
    const entry = makeEntry('entry-uuid-1', 'rejected');
    getByIdMock.mockResolvedValue({ data: entry, error: null });
    queryUserEntriesMock.mockResolvedValue({ data: [entry], error: null, count: 1 });
    renderList('/time-entries?status=rejected&entry=entry-uuid-1');
    await waitFor(() => {
      expect(getByIdMock).toHaveBeenCalledWith('entry-uuid-1');
    });
  });

  it('combines status filter and entry deep-link (both work together)', async () => {
    const entry = makeEntry('entry-uuid-1', 'rejected');
    getByIdMock.mockResolvedValue({ data: entry, error: null });
    queryUserEntriesMock.mockResolvedValue({ data: [entry], error: null, count: 1 });
    renderList('/time-entries?status=rejected&entry=entry-uuid-1');
    // Status filter applied to the query
    await waitFor(() => {
      const call = queryUserEntriesMock.mock.calls[0]![0] as { status?: string };
      expect(call.status).toBe('rejected');
    });
    // Entry modal opened
    await waitFor(() => {
      expect(getByIdMock).toHaveBeenCalledWith('entry-uuid-1');
    });
  });

  it('updates the status filter when the user changes the dropdown', async () => {
    const user = userEvent.setup();
    renderList('/time-entries');
    await waitFor(() => expect(queryUserEntriesMock).toHaveBeenCalled());
    queryUserEntriesMock.mockClear();
    const select = screen.getByLabelText('Filtrar por status') as HTMLSelectElement;
    await user.selectOptions(select, 'approved');
    await waitFor(() => {
      expect(queryUserEntriesMock).toHaveBeenCalled();
      const call = queryUserEntriesMock.mock.calls[0]![0] as { status?: string };
      expect(call.status).toBe('approved');
    });
  });

  it('shows "Limpar filtros" button when filters are active and clears them on click', async () => {
    const user = userEvent.setup();
    renderList('/time-entries?status=rejected');
    await waitFor(() => {
      expect(screen.getByText('Limpar filtros')).toBeInTheDocument();
    });
    await user.click(screen.getByText('Limpar filtros'));
    await waitFor(() => {
      const select = screen.getByLabelText('Filtrar por status') as HTMLSelectElement;
      expect(select.value).toBe('');
    });
  });
});
