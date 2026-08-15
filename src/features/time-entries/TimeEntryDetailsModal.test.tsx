import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { TimeEntryDetailsModal, type TimeEntryDetail } from './TimeEntryDetailsModal';

// Mock dependencies
vi.mock('@/lib/supabase/api', () => ({
  timeEntriesAPI: {
    getHistory: vi.fn().mockResolvedValue({ data: [], error: null }),
  },
}));
vi.mock('@/features/time-entries/CommentsPanel', () => ({
  CommentsPanel: () => <div data-testid="comments-panel" />,
}));
vi.mock('@/features/time-entries/AttachmentsPanel', () => ({
  AttachmentsPanel: () => <div data-testid="attachments-panel" />,
}));

function makeEntry(overrides: Partial<TimeEntryDetail> = {}): TimeEntryDetail {
  return {
    id: 'entry-1',
    project_id: 'proj-1',
    professional_id: 'prof-1',
    entry_date: '2024-01-15',
    duration_minutes: 120,
    description: 'Test work description',
    approval_status: 'pending',
    applied_hourly_rate: 100,
    rejection_reason: null,
    rejected_by: null,
    rejected_at: null,
    late_submission_reason: null,
    created_at: '2024-01-15T10:00:00Z',
    updated_at: '2024-01-15T10:00:00Z',
    phase_id: null,
    task_id: null,
    project: { name: 'Project A' },
    professional: { full_name: 'John Doe' },
    ...overrides,
  };
}

function renderModal(props: Partial<Parameters<typeof TimeEntryDetailsModal>[0]> = {}) {
  const defaults = {
    entry: makeEntry(),
    isOpen: true,
    onClose: vi.fn(),
    isAdmin: true,
    onApprove: vi.fn().mockResolvedValue(undefined),
    onReject: vi.fn().mockResolvedValue(undefined),
  };
  return render(
    <MemoryRouter>
      <TimeEntryDetailsModal {...defaults} {...props} />
    </MemoryRouter>
  );
}

describe('TimeEntryDetailsModal — future legacy behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows future warning banner for future legacy pending entry', async () => {
    // Use a date far in the future
    const futureDate = '2099-12-31';
    renderModal({ entry: makeEntry({ entry_date: futureDate, approval_status: 'pending' }) });

    await waitFor(() => {
      expect(screen.getByText('⚠ Data futura')).toBeInTheDocument();
    });
    expect(screen.getByText(/data posterior à data atual/i)).toBeInTheDocument();
  });

  it('disables approve button for future legacy entry', async () => {
    const futureDate = '2099-12-31';
    renderModal({ entry: makeEntry({ entry_date: futureDate, approval_status: 'pending' }) });

    const approveButton = await screen.findByText('Aprovar');
    expect(approveButton).toBeDisabled();
    expect(approveButton).toHaveAttribute('title', 'Apontamentos com data futura não podem ser aprovados.');
  });

  it('keeps reject button enabled for future legacy entry', async () => {
    const futureDate = '2099-12-31';
    renderModal({ entry: makeEntry({ entry_date: futureDate, approval_status: 'pending' }) });

    const rejectButton = await screen.findByText('Rejeitar');
    expect(rejectButton).not.toBeDisabled();
  });

  it('does NOT show future banner for normal past entry', async () => {
    renderModal({ entry: makeEntry({ entry_date: '2024-01-15', approval_status: 'pending' }) });

    await waitFor(() => {
      expect(screen.queryByText('⚠ Data futura')).not.toBeInTheDocument();
    });
  });

  it('enables approve button for normal past entry', async () => {
    renderModal({ entry: makeEntry({ entry_date: '2024-01-15', approval_status: 'pending' }) });

    const approveButton = await screen.findByText('Aprovar');
    expect(approveButton).not.toBeDisabled();
  });

  it('does not call onApprove when approve button is disabled (future legacy)', async () => {
    const onApprove = vi.fn().mockResolvedValue(undefined);
    const futureDate = '2099-12-31';
    renderModal({ entry: makeEntry({ entry_date: futureDate }), onApprove });

    const approveButton = screen.getByText('Aprovar');
    expect(approveButton).toBeDisabled();

    // Clicking a disabled button should not fire onClick
    fireEvent.click(approveButton);
    await waitFor(() => {
      expect(onApprove).not.toHaveBeenCalled();
    });
  });

  it('calls onApprove when approve button is clicked for normal entry', async () => {
    const onApprove = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();
    renderModal({ entry: makeEntry({ entry_date: '2024-01-15' }), onApprove, onClose });

    const approveButton = screen.getByText('Aprovar');
    fireEvent.click(approveButton);

    await waitFor(() => {
      expect(onApprove).toHaveBeenCalledWith('entry-1');
    });
    await waitFor(() => {
      expect(onClose).toHaveBeenCalled();
    });
  });

  it('does not show future banner for future entry that is already rejected', async () => {
    const futureDate = '2099-12-31';
    renderModal({ entry: makeEntry({ entry_date: futureDate, approval_status: 'rejected' }) });

    await waitFor(() => {
      expect(screen.queryByText('⚠ Data futura')).not.toBeInTheDocument();
    });
  });
});
