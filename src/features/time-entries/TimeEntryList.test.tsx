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
    applied_hourly_rate: null as number | null,
    rejection_reason: (status === 'rejected' ? 'Needs more detail' : null) as string | null,
    rejected_by: null as string | null,
    rejected_at: null as string | null,
    created_at: '2024-08-14T10:00:00Z',
    updated_at: null as string | null,
    phase_id: null as string | null,
    task_id: null as string | null,
    project: { name: 'Aurora' },
    phase: null as { name: string } | null,
    task: null as { title: string } | null,
    rejected_by_profile: null as { full_name: string } | null,
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

// ==========================================================================
// A12: Deep link to rejected entry — integrated test
// When the user navigates to /time-entries?status=rejected&entry=<id>:
//   1. The status filter is set to "rejected"
//   2. The entry details modal opens automatically
//   3. The rejection reason is visible in the modal
//   4. Closing the modal removes only the `entry` param (status stays rejected)
// ==========================================================================
describe('TimeEntryList — deep link to rejected entry (A12 integrated)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('opens modal with rejection reason visible, and closing removes only the entry param', async () => {
    const user = userEvent.setup();
    const rejectedEntry = makeEntry('entry-rej-1', 'rejected');
    rejectedEntry.rejection_reason = 'Descrição insuficiente para aprovação do apontamento';
    rejectedEntry.rejected_by = 'admin-uuid';
    rejectedEntry.rejected_at = '2024-08-14T12:00:00Z';
    rejectedEntry.rejected_by_profile = { full_name: 'Admin User' };

    getByIdMock.mockResolvedValue({ data: rejectedEntry, error: null });
    queryUserEntriesMock.mockResolvedValue({ data: [rejectedEntry], error: null, count: 1 });

    renderList('/time-entries?status=rejected&entry=entry-rej-1');

    // 1. Status filter is set to "rejected"
    await waitFor(() => {
      const select = screen.getByLabelText('Filtrar por status') as HTMLSelectElement;
      expect(select.value).toBe('rejected');
    });

    // 2. The entry details modal opens automatically (getById called with the entry id)
    await waitFor(() => {
      expect(getByIdMock).toHaveBeenCalledWith('entry-rej-1');
    });

    // 3. The rejection reason is visible in the modal
    await waitFor(() => {
      expect(screen.getByText(/Descrição insuficiente para aprovação do apontamento/)).toBeInTheDocument();
    });

    // 4. Close the modal — the `entry` param should be removed but status stays
    const closeButton = screen.queryByRole('button', { name: /close|fechar|×/i }) ?? screen.getAllByRole('button').find(b => b.textContent === '×' || b.textContent === 'Close');
    if (closeButton) {
      await user.click(closeButton as HTMLElement);
    }
    // The status filter should still be "rejected" after closing the modal
    await waitFor(() => {
      const select = screen.getByLabelText('Filtrar por status') as HTMLSelectElement;
      expect(select.value).toBe('rejected');
    });
  });

  it('does not open modal when entry param is absent (only status filter applied)', async () => {
    const entry = makeEntry('entry-rej-2', 'rejected');
    queryUserEntriesMock.mockResolvedValue({ data: [entry], error: null, count: 1 });

    renderList('/time-entries?status=rejected');

    await waitFor(() => {
      expect(queryUserEntriesMock).toHaveBeenCalled();
    });
    // getById should NOT be called (no entry param)
    expect(getByIdMock).not.toHaveBeenCalled();
  });
});
