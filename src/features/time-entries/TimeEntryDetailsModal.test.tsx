import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { TimeEntryDetailsModal, type TimeEntryDetail } from '@/features/time-entries/TimeEntryDetailsModal';

// Mock the API
vi.mock('@/lib/supabase/api', () => ({
  timeEntriesAPI: {
    getHistory: vi.fn().mockResolvedValue({ data: [], error: null }),
    approve: vi.fn(),
    reject: vi.fn(),
  },
}));

// Mock CommentsPanel and AttachmentsPanel to keep test focused
vi.mock('@/features/time-entries/CommentsPanel', () => ({
  CommentsPanel: () => <div data-testid="comments-panel">Comments</div>,
}));
vi.mock('@/features/time-entries/AttachmentsPanel', () => ({
  AttachmentsPanel: () => <div data-testid="attachments-panel">Attachments</div>,
}));

// Mock mapDatabaseError
vi.mock('@/lib/errors', () => ({
  mapDatabaseError: (err: unknown) => (err instanceof Error ? err.message : 'Erro'),
}));

const mockEntry: TimeEntryDetail = {
  id: 'entry-1',
  project_id: 'proj-1',
  professional_id: 'prof-1',
  entry_date: '2024-08-15',
  duration_minutes: 120,
  description: 'Test description for the entry',
  approval_status: 'pending',
  applied_hourly_rate: 100,
  rejection_reason: null,
  rejected_by: null,
  rejected_at: null,
  created_at: '2024-08-15T10:00:00Z',
  updated_at: null,
  phase_id: null,
  task_id: null,
  project: { name: 'Test Project' },
  professional: { full_name: 'John Doe' },
  phase: null,
  task: null,
  rejected_by_profile: null,
};

function renderModal(props: Partial<Parameters<typeof TimeEntryDetailsModal>[0]> = {}) {
  return render(
    <MemoryRouter>
      <TimeEntryDetailsModal
        entry={props.entry ?? mockEntry}
        isOpen={true}
        onClose={vi.fn()}
        isAdmin={false}
        {...props}
      />
    </MemoryRouter>
  );
}

describe('TimeEntryDetailsModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders core entry details', () => {
    renderModal();
    expect(screen.getByText('Test Project')).toBeInTheDocument();
    expect(screen.getByText('2h')).toBeInTheDocument();
    expect(screen.getByText('Test description for the entry')).toBeInTheDocument();
    expect(screen.getByText('Pendente')).toBeInTheDocument();
  });

  it('shows rejection details for rejected entries', () => {
    const rejectedEntry: TimeEntryDetail = {
      ...mockEntry,
      approval_status: 'rejected',
      rejection_reason: 'Work not documented',
      rejected_by_profile: { full_name: 'Admin User' },
      rejected_at: '2024-08-16T12:00:00Z',
    };
    renderModal({ entry: rejectedEntry });
    // "Rejeitado" appears in both the status badge and the rejection section header
    const rejectedElements = screen.getAllByText('Rejeitado');
    expect(rejectedElements.length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/Work not documented/)).toBeInTheDocument();
    expect(screen.getByText(/Admin User/)).toBeInTheDocument();
  });

  it('does not show admin actions for non-admin users', () => {
    renderModal({ isAdmin: false });
    expect(screen.queryByText('Aprovar')).not.toBeInTheDocument();
    expect(screen.queryByText('Rejeitar')).not.toBeInTheDocument();
  });

  it('shows approve/reject buttons for admin with pending entries', () => {
    renderModal({ isAdmin: true, onApprove: vi.fn(), onReject: vi.fn() });
    expect(screen.getByText('Aprovar')).toBeInTheDocument();
    expect(screen.getByText('Rejeitar')).toBeInTheDocument();
  });

  it('does not show approve/reject for approved entries', () => {
    const approvedEntry: TimeEntryDetail = {
      ...mockEntry,
      approval_status: 'approved',
    };
    renderModal({ entry: approvedEntry, isAdmin: true, onApprove: vi.fn(), onReject: vi.fn() });
    expect(screen.queryByText('Aprovar')).not.toBeInTheDocument();
    expect(screen.queryByText('Rejeitar')).not.toBeInTheDocument();
  });

  it('shows admin financial details only for admin', () => {
    renderModal({ isAdmin: true });
    expect(screen.getByText('Detalhes Administrativos')).toBeInTheDocument();
    expect(screen.getByText('John Doe')).toBeInTheDocument();
  });

  it('does not show admin financial details for regular users', () => {
    renderModal({ isAdmin: false });
    expect(screen.queryByText('Detalhes Administrativos')).not.toBeInTheDocument();
  });

  it('shows phase and task when present', () => {
    const entryWithPhase: TimeEntryDetail = {
      ...mockEntry,
      phase: { name: 'Development Phase' },
      task: { title: 'Implement feature X' },
    };
    renderModal({ entry: entryWithPhase });
    expect(screen.getByText('Development Phase')).toBeInTheDocument();
    expect(screen.getByText('Implement feature X')).toBeInTheDocument();
  });

  it('calls onApprove when approve button is clicked', async () => {
    const onApprove = vi.fn().mockResolvedValue(undefined);
    renderModal({ isAdmin: true, onApprove });
    const approveBtn = screen.getByText('Aprovar');
    fireEvent.click(approveBtn);
    await waitFor(() => {
      expect(onApprove).toHaveBeenCalledWith('entry-1');
    });
  });

  it('shows inline reject form when reject button is clicked', async () => {
    const onReject = vi.fn().mockResolvedValue(undefined);
    renderModal({ isAdmin: true, onReject });
    fireEvent.click(screen.getByText('Rejeitar'));
    expect(await screen.findByText('Motivo da rejeição *')).toBeInTheDocument();
  });

  it('disables confirm reject when reason is too short', async () => {
    const onReject = vi.fn().mockResolvedValue(undefined);
    renderModal({ isAdmin: true, onReject });
    fireEvent.click(screen.getByText('Rejeitar'));
    const textarea = await screen.findByPlaceholderText(/mínimo 10 caracteres/);
    fireEvent.change(textarea, { target: { value: 'short' } });
    const confirmBtn = screen.getByText('Confirmar Rejeição');
    expect(confirmBtn).toBeDisabled();
  });
});
